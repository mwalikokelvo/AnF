//! Windows 10+ speech child: job membership is assigned at process creation.
//! Explicit pipe/NUL handles only; requests stay off disk.
use std::{
    ffi::OsString,
    fs::File,
    io::{Read, Write},
    os::windows::{
        ffi::OsStrExt,
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
    },
    path::Path,
};
use windows::{
    core::{BOOL, PCWSTR, PWSTR},
    Win32::{
        Foundation::{
            SetHandleInformation, HANDLE, HANDLE_FLAGS, HANDLE_FLAG_INHERIT, WAIT_TIMEOUT,
        },
        Security::SECURITY_ATTRIBUTES,
        System::{
            JobObjects::{
                CreateJobObjectW, IsProcessInJob, JobObjectExtendedLimitInformation,
                SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
            Pipes::{CreatePipe, PeekNamedPipe},
            Threading::*,
        },
    },
};
fn raw(h: &OwnedHandle) -> HANDLE {
    HANDLE(h.as_raw_handle())
}
unsafe fn owned(h: HANDLE) -> OwnedHandle {
    OwnedHandle::from_raw_handle(h.0)
}
struct Attributes {
    list: LPPROC_THREAD_ATTRIBUTE_LIST,
    _storage: Vec<usize>,
}
impl Drop for Attributes {
    fn drop(&mut self) {
        unsafe {
            DeleteProcThreadAttributeList(self.list);
        }
    }
}
impl Attributes {
    unsafe fn new() -> Result<Self, String> {
        let mut bytes = 0;
        let _ = InitializeProcThreadAttributeList(None, 2, None, &mut bytes);
        if bytes == 0 || bytes > 65536 {
            return Err("Cannot size private speech process attributes.".into());
        }
        let mut storage = vec![0usize; bytes.div_ceil(std::mem::size_of::<usize>())];
        let list = LPPROC_THREAD_ATTRIBUTE_LIST(storage.as_mut_ptr().cast());
        InitializeProcThreadAttributeList(Some(list), 2, None, &mut bytes)
            .map_err(|_| "Cannot initialize private speech process attributes.")?;
        Ok(Self {
            list,
            _storage: storage,
        })
    }
    unsafe fn set(&self, key: u32, handles: &[HANDLE]) -> Result<(), String> {
        UpdateProcThreadAttribute(
            self.list,
            0,
            key as usize,
            Some(handles.as_ptr().cast()),
            std::mem::size_of_val(handles),
            None,
            None,
        )
        .map_err(|_| "Windows could not contain the local speech process; startup refused.".into())
    }
}
pub struct VoiceProcess {
    process: OwnedHandle,
    job: OwnedHandle,
    input: Option<File>,
    output: Option<File>,
    frame: Vec<u8>,
}
impl VoiceProcess {
    pub fn start(executable: &Path, worker: &Path, cwd: &Path) -> Result<Self, String> {
        Self::start_inner(executable, worker, cwd, false)
    }
    pub fn start_resident(executable: &Path, worker: &Path, cwd: &Path) -> Result<Self, String> {
        Self::start_inner(executable, worker, cwd, true)
    }
    fn start_inner(
        executable: &Path,
        worker: &Path,
        cwd: &Path,
        capture: bool,
    ) -> Result<Self, String> {
        unsafe {
            let job = owned(
                CreateJobObjectW(None, None).map_err(|_| "Cannot create private speech job.")?,
            );
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(
                raw(&job),
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                std::mem::size_of_val(&limits) as u32,
            )
            .map_err(|_| "Cannot protect private speech job.")?;
            let mut reader = HANDLE::default();
            let mut writer = HANDLE::default();
            let security = SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                bInheritHandle: true.into(),
                ..Default::default()
            };
            CreatePipe(&mut reader, &mut writer, Some(&security), 16384)
                .map_err(|_| "Cannot create private speech input.")?;
            let read = owned(reader);
            let write = owned(writer);
            SetHandleInformation(raw(&write), HANDLE_FLAG_INHERIT.0, HANDLE_FLAGS(0))
                .map_err(|_| "Cannot protect private speech input.")?;
            let null = File::options()
                .write(true)
                .open("NUL")
                .map_err(|_| "Cannot open private speech output sink.")?;
            let null_handle = HANDLE(null.as_raw_handle());
            SetHandleInformation(null_handle, HANDLE_FLAG_INHERIT.0, HANDLE_FLAG_INHERIT)
                .map_err(|_| "Cannot protect private speech output handles.")?;
            let (output_read, output_write) = if capture {
                let mut reader = HANDLE::default();
                let mut writer = HANDLE::default();
                CreatePipe(&mut reader, &mut writer, Some(&security), 4096)
                    .map_err(|_| "Cannot create private speech response pipe.")?;
                let reader = owned(reader);
                let writer = owned(writer);
                SetHandleInformation(raw(&reader), HANDLE_FLAG_INHERIT.0, HANDLE_FLAGS(0))
                    .map_err(|_| "Cannot protect private speech response pipe.")?;
                (Some(reader), Some(writer))
            } else {
                (None, None)
            };
            let output_handle = output_write.as_ref().map(raw).unwrap_or(null_handle);
            let mut inherited = vec![raw(&read), null_handle];
            if capture {
                inherited.push(output_handle);
            }
            let jobs = [raw(&job)];
            let attrs = Attributes::new()?;
            attrs.set(PROC_THREAD_ATTRIBUTE_HANDLE_LIST, &inherited)?;
            attrs.set(PROC_THREAD_ATTRIBUTE_JOB_LIST, &jobs)?;
            let args = [
                OsString::from("-I"),
                OsString::from("-B"),
                worker.as_os_str().to_os_string(),
            ];
            let mut command = crate::managed_process::command_line(executable, &args)?;
            let exe: Vec<u16> = executable
                .as_os_str()
                .encode_wide()
                .chain(Some(0))
                .collect();
            let directory: Vec<u16> = cwd.as_os_str().encode_wide().chain(Some(0)).collect();
            if directory[..directory.len() - 1].contains(&0) {
                return Err("Speech paths cannot contain NUL.".into());
            }
            let mut environment = Vec::<u16>::new();
            // Do not inherit provider keys, proxies, PYTHONPATH or a user Python home.
            let mut entries = Vec::new();
            for key in [
                "SYSTEMROOT",
                "WINDIR",
                "TEMP",
                "TMP",
                "USERPROFILE",
                "LOCALAPPDATA",
                "APPDATA",
                "PROGRAMDATA",
                "NUMBER_OF_PROCESSORS",
                "PROCESSOR_ARCHITECTURE",
            ] {
                if let Some(value) = std::env::var_os(key) {
                    if let Some(value) = value.to_str() {
                        entries.push((key.to_string(), value.to_string()));
                    }
                }
            }
            if let Some(system) = std::env::var_os("SYSTEMROOT") {
                let system = std::path::PathBuf::from(system);
                let paths = [system.join("System32"), system];
                entries.push((
                    "PATH".into(),
                    std::env::join_paths(paths)
                        .map_err(|_| "Invalid Windows runtime paths.")?
                        .to_str()
                        .ok_or("Invalid Windows runtime paths.")?
                        .to_string(),
                ));
            }
            entries.sort_by_key(|(key, _)| key.to_ascii_uppercase());
            for (key, value) in entries {
                if value.contains('\0') {
                    return Err("Invalid speech runtime environment.".into());
                }
                environment.extend(format!("{key}={value}").encode_utf16());
                environment.push(0);
            }
            environment.push(0);
            if environment.len() == 1 {
                environment.push(0);
            }
            let mut startup = STARTUPINFOEXW::default();
            startup.StartupInfo.cb = std::mem::size_of_val(&startup) as u32;
            startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
            startup.StartupInfo.hStdInput = raw(&read);
            startup.StartupInfo.hStdOutput = output_handle;
            startup.StartupInfo.hStdError = null_handle;
            startup.lpAttributeList = attrs.list;
            let mut info = PROCESS_INFORMATION::default();
            CreateProcessW(
                PCWSTR(exe.as_ptr()),
                Some(PWSTR(command.as_mut_ptr())),
                None,
                None,
                true,
                CREATE_SUSPENDED
                    | CREATE_NO_WINDOW
                    | CREATE_UNICODE_ENVIRONMENT
                    | EXTENDED_STARTUPINFO_PRESENT,
                Some(environment.as_ptr().cast()),
                PCWSTR(directory.as_ptr()),
                &startup.StartupInfo,
                &mut info,
            )
            .map_err(|_| "The contained local speech runtime could not start.")?;
            let process = owned(info.hProcess);
            let thread = owned(info.hThread);
            let mut contained = BOOL::default();
            if IsProcessInJob(raw(&process), Some(raw(&job)), &mut contained).is_err()
                || !contained.as_bool()
            {
                let _ = TerminateProcess(raw(&process), 1);
                return Err("Local speech containment could not be confirmed.".into());
            }
            if ResumeThread(raw(&thread)) == u32::MAX {
                let _ = TerminateJobObject(raw(&job), 1);
                return Err("Cannot resume contained local speech.".into());
            }
            Ok(Self {
                process,
                job,
                input: Some(File::from(write)),
                output: output_read.map(File::from),
                frame: Vec::new(),
            })
        }
    }
    pub fn send(&mut self, payload: &[u8]) -> Result<(), String> {
        if payload.len() > 8192 {
            return Err("Local speech input exceeded its limit.".into());
        }
        self.input
            .take()
            .ok_or("Local speech input unavailable.")?
            .write_all(payload)
            .map_err(|_| "Local speech input failed.".into())
    }
    pub fn send_frame(&mut self, payload: &[u8]) -> Result<(), String> {
        if payload.len() >= 8192 || payload.contains(&b'\n') || !self.frame.is_empty() {
            return Err("Invalid local speech protocol frame.".into());
        }
        let input = self
            .input
            .as_mut()
            .ok_or("Local speech input unavailable.")?;
        input
            .write_all(payload)
            .and_then(|_| input.write_all(b"\n"))
            .map_err(|_| "Local speech input failed.".into())
    }
    pub fn reply(&mut self) -> Result<Option<Vec<u8>>, String> {
        let output = self
            .output
            .as_mut()
            .ok_or("Local speech output unavailable.")?;
        let mut available = 0;
        unsafe {
            PeekNamedPipe(
                HANDLE(output.as_raw_handle()),
                None,
                0,
                None,
                Some(&mut available),
                None,
            )
        }
        .map_err(|_| "Local speech response pipe stopped.".to_string())?;
        if available == 0 {
            return Ok(None);
        }
        if self.frame.len() + available as usize > 256 {
            return Err("Local speech response exceeded its limit.".into());
        }
        let mut bytes = vec![0; available as usize];
        output
            .read_exact(&mut bytes)
            .map_err(|_| "Local speech response failed.")?;
        self.frame.extend(bytes);
        if let Some(end) = self.frame.iter().position(|&b| b == b'\n') {
            if end + 1 != self.frame.len() {
                return Err("Unexpected local speech response.".into());
            }
            return Ok(Some(std::mem::take(&mut self.frame)));
        }
        Ok(None)
    }
    pub fn exit_code(&self) -> Result<Option<u32>, String> {
        unsafe {
            if WaitForSingleObject(raw(&self.process), 0) == WAIT_TIMEOUT {
                return Ok(None);
            }
            let mut code = 0;
            GetExitCodeProcess(raw(&self.process), &mut code)
                .map_err(|_| "Local speech process stopped unexpectedly.")?;
            Ok(Some(code))
        }
    }
    pub fn terminate(&self) {
        unsafe {
            let _ = TerminateJobObject(raw(&self.job), 1);
            let _ = WaitForSingleObject(raw(&self.process), 3000);
        }
    }
}
impl Drop for VoiceProcess {
    fn drop(&mut self) {
        self.input.take();
        self.terminate();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Requires ANF_TEST_VOICE_PYTHON; launches only owned protocol fixtures."]
    fn resident_protocol_reuses_one_process_and_rejects_oversized_responses() {
        let python = std::path::PathBuf::from(std::env::var_os("ANF_TEST_VOICE_PYTHON").unwrap());
        let dir = std::env::temp_dir().join(format!(
            "AnF resident fixture-é-{}",
            crate::local_ai::random_key().unwrap()
        ));
        std::fs::create_dir(&dir).unwrap();
        let script = dir.join("fixture.py");
        std::fs::write(&script,"import sys,json\nfor line in sys.stdin.buffer:\n value=json.loads(line)\n print(json.dumps(value),flush=True)\n").unwrap();
        let mut process = VoiceProcess::start_resident(&python, &script, &dir).unwrap();
        for id in ["first λ", "second 🌻"] {
            process
                .send_frame(serde_json::json!({"id":id}).to_string().as_bytes())
                .unwrap();
            let start = std::time::Instant::now();
            let frame = loop {
                if let Some(frame) = process.reply().unwrap() {
                    break frame;
                }
                assert!(start.elapsed().as_secs() < 10);
                std::thread::sleep(std::time::Duration::from_millis(10));
            };
            let value: serde_json::Value = serde_json::from_slice(&frame).unwrap();
            assert_eq!(value["id"], id);
            assert_eq!(process.exit_code().unwrap(), None);
        }
        assert!(process.send_frame(&vec![b'x'; 8192]).is_err());
        assert!(process.send_frame(b"{}\n{}").is_err());
        drop(process);
        std::fs::write(&script,"import sys,time\nsys.stdin.buffer.readline()\nprint('x'*300,flush=True)\ntime.sleep(30)\n").unwrap();
        let mut process = VoiceProcess::start_resident(&python, &script, &dir).unwrap();
        process.send_frame(b"{}").unwrap();
        let start = std::time::Instant::now();
        loop {
            match process.reply() {
                Err(_) => break,
                Ok(None) => {}
                Ok(Some(_)) => panic!("Oversized protocol frame accepted"),
            };
            assert!(start.elapsed().as_secs() < 10);
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        drop(process);
        std::fs::remove_file(script).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
    #[test]
    #[ignore = "Requires ANF_TEST_VOICE_PYTHON and a harmless ANF_VOICE_INHERIT_PROBE sentinel; launches only owned fixture processes."]
    fn contains_descendants_and_keeps_private_stdin_and_environment_scoped() {
        assert_eq!(
            std::env::var("ANF_VOICE_INHERIT_PROBE").unwrap(),
            "not-a-real-secret"
        );
        let python = std::path::PathBuf::from(std::env::var_os("ANF_TEST_VOICE_PYTHON").unwrap());
        assert!(python.is_absolute() && python.is_file());
        let dir = std::env::temp_dir().join(format!(
            "AnF voice fixture-é-{}",
            crate::local_ai::random_key().unwrap()
        ));
        std::fs::create_dir(&dir).unwrap();
        let worker = dir.join("fixture.py");
        std::fs::write(&worker,"import sys,json,pathlib,os,subprocess,time\ndata=json.loads(sys.stdin.buffer.read())\nchild=subprocess.Popen([sys.executable,'-I','-B','-c','import time;time.sleep(90)'])\npathlib.Path(__file__).with_name('result.json').write_text(json.dumps({'input':data,'child':child.pid,'probePresent':'ANF_VOICE_INHERIT_PROBE' in os.environ}))\ntime.sleep(90)\n").unwrap();
        let mut owner = VoiceProcess::start(&python, &worker, &dir).unwrap();
        owner.send("{\"text\":\"safe λ 🌻\"}".as_bytes()).unwrap();
        let until = std::time::Instant::now();
        let result = dir.join("result.json");
        while !result.is_file() && until.elapsed() < std::time::Duration::from_secs(15) {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        let data: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&result).unwrap()).unwrap();
        assert_eq!(data["input"]["text"], "safe λ 🌻");
        assert_eq!(data["probePresent"], false);
        let descendant = unsafe {
            owned(
                OpenProcess(
                    PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION,
                    false,
                    data["child"].as_u64().unwrap() as u32,
                )
                .unwrap(),
            )
        };
        assert_eq!(
            unsafe { WaitForSingleObject(raw(&descendant), 0) },
            WAIT_TIMEOUT
        );
        drop(owner);
        assert_eq!(
            unsafe { WaitForSingleObject(raw(&descendant), 5000) },
            windows::Win32::Foundation::WAIT_OBJECT_0
        );
        crate::managed_component::no_links(&dir).unwrap();
        for name in ["fixture.py", "result.json"] {
            std::fs::remove_file(dir.join(name)).unwrap();
        }
        std::fs::remove_dir(dir).unwrap();
    }
}
