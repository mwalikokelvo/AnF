//! Windows process ownership: create suspended, assign a kill-on-close Job,
//! then resume its owned initial thread. Never adopt an existing process.
use std::path::Path;
#[cfg(windows)]
use windows::{
    core::{PCWSTR, PWSTR},
    Win32::{
        Foundation::{CloseHandle, LocalFree, HANDLE, HLOCAL, WAIT_TIMEOUT},
        Security::{
            Authorization::{
                ConvertStringSecurityDescriptorToSecurityDescriptorW, SetNamedSecurityInfoW,
                SE_FILE_OBJECT,
            },
            GetSecurityDescriptorDacl, DACL_SECURITY_INFORMATION,
            PROTECTED_DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR,
        },
        System::{
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
            Threading::{
                CreateProcessW, ResumeThread, WaitForSingleObject, CREATE_NO_WINDOW,
                CREATE_SUSPENDED, CREATE_UNICODE_ENVIRONMENT, PROCESS_INFORMATION, STARTUPINFOW,
            },
        },
    },
};
#[cfg(windows)]
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}
pub fn private_directory(path: &Path) -> Result<(), String> {
    crate::managed_component::no_links(path)?;
    #[cfg(windows)]
    unsafe {
        let sid = crate::platform::current_user_sid()
            .ok_or("Cannot resolve the current user for private gateway storage.")?;
        let sddl = wide(&format!(
            "D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FA;;;{sid})"
        ));
        let mut descriptor = PSECURITY_DESCRIPTOR::default();
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            PCWSTR(sddl.as_ptr()),
            1,
            &mut descriptor,
            None,
        )
        .map_err(|_| "Cannot create private gateway security descriptor.")?;
        let result = (|| {
            let (mut present, mut defaulted) = (false.into(), false.into());
            let mut acl = std::ptr::null_mut();
            GetSecurityDescriptorDacl(descriptor, &mut present, &mut acl, &mut defaulted)
                .map_err(|_| "Cannot inspect gateway ACL.")?;
            let name = wide(&path.to_string_lossy());
            let error = SetNamedSecurityInfoW(
                PCWSTR(name.as_ptr()),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                None,
                None,
                Some(acl),
                None,
            );
            if error.0 != 0 {
                return Err("Cannot protect private gateway storage.".into());
            }
            Ok(())
        })();
        let _ = LocalFree(Some(HLOCAL(descriptor.0)));
        result
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("The reviewed optional gateway component currently supports Windows x64.".into())
    }
}
#[cfg(windows)]
pub struct OwnedProcess {
    process: HANDLE,
    job: HANDLE,
}
#[cfg(windows)]
unsafe impl Send for OwnedProcess {}
// Shared methods only query process/socket ownership. Closing/terminating handles
// occurs exclusively in Drop, which cannot run while a shared reference is held.
#[cfg(windows)]
unsafe impl Sync for OwnedProcess {}
#[cfg(not(windows))]
pub struct OwnedProcess;
/// A duplicated process handle keeps the original PID reserved even if Stop
/// closes the owning job while an HTTP request is in flight.
pub struct ProcessIdentity {
    #[cfg(windows)]
    process: HANDLE,
    #[cfg(windows)]
    pid: u32,
}
#[cfg(windows)]
unsafe impl Send for ProcessIdentity {}
#[cfg(windows)]
unsafe impl Sync for ProcessIdentity {}
impl ProcessIdentity {
    #[cfg(windows)]
    fn duplicate(process: HANDLE) -> Result<Self, String> {
        use windows::Win32::{
            Foundation::{DuplicateHandle, DUPLICATE_SAME_ACCESS},
            System::Threading::{GetCurrentProcess, GetProcessId},
        };
        unsafe {
            let mut handle = HANDLE::default();
            DuplicateHandle(
                GetCurrentProcess(),
                process,
                GetCurrentProcess(),
                &mut handle,
                0,
                false,
                DUPLICATE_SAME_ACCESS,
            )
            .map_err(|_| "Cannot retain private gateway identity.")?;
            Ok(Self {
                process: handle,
                pid: GetProcessId(handle),
            })
        }
    }
    pub fn owns_connection(&self, server: u16, client: u16) -> bool {
        #[cfg(windows)]
        unsafe {
            self.pid != 0
                && WaitForSingleObject(self.process, 0) == WAIT_TIMEOUT
                && connection_pid(server, client) == Some(self.pid)
                && WaitForSingleObject(self.process, 0) == WAIT_TIMEOUT
        }
        #[cfg(not(windows))]
        {
            let _ = (server, client);
            false
        }
    }
    #[cfg(all(test, windows))]
    pub fn current_for_test(reject: bool) -> Self {
        let mut value =
            Self::duplicate(unsafe { windows::Win32::System::Threading::GetCurrentProcess() })
                .unwrap();
        if reject {
            value.pid = 0;
        }
        value
    }
}
impl Drop for ProcessIdentity {
    fn drop(&mut self) {
        #[cfg(windows)]
        unsafe {
            let _ = CloseHandle(self.process);
        }
    }
}
#[cfg(windows)]
fn connection_pid(server: u16, client: u16) -> Option<u32> {
    use windows::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, TCP_TABLE_OWNER_PID_CONNECTIONS,
    };
    unsafe {
        let mut size = 0u32;
        let _ = GetExtendedTcpTable(
            None,
            &mut size,
            false,
            2,
            TCP_TABLE_OWNER_PID_CONNECTIONS,
            0,
        );
        for _ in 0..3 {
            if !(4..=16 * 1024 * 1024).contains(&size) {
                return None;
            }
            let mut bytes = vec![0u8; size as usize];
            let result = GetExtendedTcpTable(
                Some(bytes.as_mut_ptr().cast()),
                &mut size,
                false,
                2,
                TCP_TABLE_OWNER_PID_CONNECTIONS,
                0,
            );
            if result == 122 {
                continue;
            }
            if result != 0 || size as usize > bytes.len() {
                return None;
            }
            let count = u32::from_ne_bytes(bytes.get(..4)?.try_into().ok()?) as usize;
            let row_size = std::mem::size_of::<MIB_TCPROW_OWNER_PID>();
            if count > (size as usize - 4) / row_size {
                return None;
            }
            for index in 0..count {
                let row = std::ptr::read_unaligned(
                    bytes
                        .as_ptr()
                        .add(4 + index * row_size)
                        .cast::<MIB_TCPROW_OWNER_PID>(),
                );
                if row.dwState == 5
                    && row.dwLocalAddr.to_ne_bytes() == [127, 0, 0, 1]
                    && row.dwRemoteAddr.to_ne_bytes() == [127, 0, 0, 1]
                    && u16::from_be(row.dwLocalPort as u16) == server
                    && u16::from_be(row.dwRemotePort as u16) == client
                {
                    return Some(row.dwOwningPid);
                }
            }
            return None;
        }
        None
    }
}
#[cfg(windows)]
fn listener_pid(port: u16) -> Option<u32> {
    use windows::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, TCP_TABLE_OWNER_PID_LISTENER,
    };
    unsafe {
        let mut size = 0u32;
        let _ = GetExtendedTcpTable(None, &mut size, false, 2, TCP_TABLE_OWNER_PID_LISTENER, 0);
        // A changing socket table may require a retry; never accept partial data.
        for _ in 0..3 {
            if !(4..=16 * 1024 * 1024).contains(&size) {
                return None;
            }
            let mut bytes = vec![0u8; size as usize];
            let result = GetExtendedTcpTable(
                Some(bytes.as_mut_ptr().cast()),
                &mut size,
                false,
                2,
                TCP_TABLE_OWNER_PID_LISTENER,
                0,
            );
            if result == 122 {
                continue;
            }
            if result != 0 || size as usize > bytes.len() {
                return None;
            }
            let count = u32::from_ne_bytes(bytes.get(..4)?.try_into().ok()?) as usize;
            let row_size = std::mem::size_of::<MIB_TCPROW_OWNER_PID>();
            if count > (size as usize - 4) / row_size {
                return None;
            }
            for index in 0..count {
                let row = std::ptr::read_unaligned(
                    bytes
                        .as_ptr()
                        .add(4 + index * row_size)
                        .cast::<MIB_TCPROW_OWNER_PID>(),
                );
                if row.dwLocalAddr.to_ne_bytes() == [127, 0, 0, 1]
                    && u16::from_be(row.dwLocalPort as u16) == port
                {
                    return Some(row.dwOwningPid);
                }
            }
            return None;
        }
        None
    }
}
impl OwnedProcess {
    pub fn terminate(&self) {
        #[cfg(windows)]
        unsafe {
            let _ = TerminateJobObject(self.job, 0);
            let _ = WaitForSingleObject(self.process, 3000);
        }
    }
    pub fn identity(&self) -> Result<ProcessIdentity, String> {
        #[cfg(windows)]
        {
            if !self.running() {
                return Err("Managed gateway stopped.".into());
            }
            ProcessIdentity::duplicate(self.process)
        }
        #[cfg(not(windows))]
        {
            Err("Managed gateway requires Windows.".into())
        }
    }
    pub fn pid(&self) -> Option<u32> {
        #[cfg(windows)]
        unsafe {
            if !self.running() {
                return None;
            }
            let pid = windows::Win32::System::Threading::GetProcessId(self.process);
            return (pid != 0).then_some(pid);
        }
        #[cfg(not(windows))]
        {
            None
        }
    }
    /// Attest the numeric loopback listener before sending any native secret.
    /// Health responses alone cannot identify the process that won a port race.
    pub fn owns_listener(&self, port: u16) -> bool {
        #[cfg(windows)]
        unsafe {
            use windows::Win32::System::Threading::GetProcessId;
            if !self.running() {
                return false;
            }
            let pid = GetProcessId(self.process);
            listener_pid(port).is_some_and(|owner| owner == pid && pid != 0) && self.running()
        }
        #[cfg(not(windows))]
        {
            let _ = port;
            false
        }
    }
    pub fn start(
        node: &Path,
        entry: &Path,
        cwd: &Path,
        env: &[(String, String)],
    ) -> Result<Self, String> {
        #[cfg(windows)]
        unsafe {
            crate::managed_component::no_links(node)?;
            crate::managed_component::no_links(entry)?;
            crate::managed_component::no_links(cwd)?;
            let job = CreateJobObjectW(None, None)
                .map_err(|_| "Cannot create private gateway process job.")?;
            let result = (|| {
                let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
                limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as *const _,
                    std::mem::size_of_val(&limits) as u32,
                )
                .map_err(|_| "Cannot protect gateway child ownership.")?;
                let exe = wide(&node.to_string_lossy());
                let mut command = wide(&format!("\"{}\" \"{}\"", node.display(), entry.display()));
                let directory = wide(&cwd.to_string_lossy());
                let mut entries = env.to_vec();
                entries.sort_by_key(|(key, _)| key.to_ascii_uppercase());
                let mut environment = Vec::<u16>::new();
                for (key, value) in entries {
                    if key.contains(['=', '\0']) || value.contains('\0') {
                        return Err("Invalid gateway environment.".into());
                    }
                    environment.extend(format!("{key}={value}").encode_utf16());
                    environment.push(0);
                }
                environment.push(0);
                let mut startup = STARTUPINFOW::default();
                startup.cb = std::mem::size_of_val(&startup) as u32;
                let mut info = PROCESS_INFORMATION::default();
                CreateProcessW(
                    PCWSTR(exe.as_ptr()),
                    Some(PWSTR(command.as_mut_ptr())),
                    None,
                    None,
                    false,
                    CREATE_SUSPENDED | CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
                    Some(environment.as_ptr() as *const _),
                    PCWSTR(directory.as_ptr()),
                    &startup,
                    &mut info,
                )
                .map_err(|_| "The optional Node runtime could not start.")?;
                if AssignProcessToJobObject(job, info.hProcess).is_err() {
                    let _ = windows::Win32::System::Threading::TerminateProcess(info.hProcess, 1);
                    let _ = CloseHandle(info.hThread);
                    let _ = CloseHandle(info.hProcess);
                    return Err("Cannot contain the gateway process; startup was refused.".into());
                }
                if ResumeThread(info.hThread) == u32::MAX {
                    let _ = TerminateJobObject(job, 1);
                    let _ = CloseHandle(info.hThread);
                    let _ = CloseHandle(info.hProcess);
                    return Err("Cannot resume the contained gateway process.".into());
                }
                let _ = CloseHandle(info.hThread);
                Ok(Self {
                    process: info.hProcess,
                    job,
                })
            })();
            if result.is_err() {
                let _ = CloseHandle(job);
            }
            result
        }
        #[cfg(not(windows))]
        {
            let _ = (node, entry, cwd, env);
            Err("The optional gateway runtime currently supports Windows x64.".into())
        }
    }
    pub fn running(&self) -> bool {
        #[cfg(windows)]
        unsafe {
            return WaitForSingleObject(self.process, 0) == WAIT_TIMEOUT;
        }
        #[cfg(not(windows))]
        {
            false
        }
    }
}
impl Drop for OwnedProcess {
    fn drop(&mut self) {
        #[cfg(windows)]
        unsafe {
            self.terminate();
            let _ = CloseHandle(self.process);
            let _ = CloseHandle(self.job);
        }
    }
}
