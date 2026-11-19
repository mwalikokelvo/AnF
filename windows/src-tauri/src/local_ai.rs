//! On-demand bundled CPU inference. Only loopback, authenticated, no cloud service.
use crate::platform;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
};

struct Running {
    child: Child,
    url: String,
    key: String,
    profile: String,
    context: usize,
}
fn pack_available(path: &std::path::Path) -> bool {
    path.join(if cfg!(windows) { "llama-server.exe" } else { "llama-server" }).is_file()
        && (path.join("model.gguf").is_file()
            || path.join("model-fast.gguf").is_file()
            || path.join("DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic.Q4_K_M.gguf").is_file()
            || crate::model_download::any_verified())
}

/// Dynamically checks whether the host system has at least one Vulkan physical device available.
pub fn has_vulkan_device() -> bool {
    #[cfg(windows)]
    {
        extern "system" {
            fn LoadLibraryA(lpLibFileName: *const u8) -> *mut std::ffi::c_void;
            fn GetProcAddress(hModule: *mut std::ffi::c_void, lpProcName: *const u8) -> *mut std::ffi::c_void;
            fn FreeLibrary(hModule: *mut std::ffi::c_void) -> i32;
        }

        unsafe {
            let lib = LoadLibraryA(b"vulkan-1.dll\0".as_ptr());
            if lib.is_null() {
                return false;
            }

            type PfnVkCreateInstance = unsafe extern "system" fn(
                *const VkInstanceCreateInfo,
                *const std::ffi::c_void,
                *mut *mut std::ffi::c_void,
            ) -> i32;
            type PfnVkDestroyInstance = unsafe extern "system" fn(*mut std::ffi::c_void, *const std::ffi::c_void);
            type PfnVkEnumeratePhysicalDevices = unsafe extern "system" fn(
                *mut std::ffi::c_void,
                *mut u32,
                *mut *mut std::ffi::c_void,
            ) -> i32;

            #[repr(C)]
            struct VkApplicationInfo {
                s_type: u32,
                p_next: *const std::ffi::c_void,
                p_application_name: *const std::ffi::c_char,
                application_version: u32,
                p_engine_name: *const std::ffi::c_char,
                engine_version: u32,
                api_version: u32,
            }

            #[repr(C)]
            struct VkInstanceCreateInfo {
                s_type: u32,
                p_next: *const std::ffi::c_void,
                flags: u32,
                p_application_info: *const VkApplicationInfo,
                enabled_layer_count: u32,
                pp_enabled_layer_names: *const *const std::ffi::c_char,
                enabled_extension_count: u32,
                pp_enabled_extension_names: *const *const std::ffi::c_char,
            }

            let p_create = GetProcAddress(lib, b"vkCreateInstance\0".as_ptr());
            let p_destroy = GetProcAddress(lib, b"vkDestroyInstance\0".as_ptr());
            let p_enum = GetProcAddress(lib, b"vkEnumeratePhysicalDevices\0".as_ptr());

            if p_create.is_null() || p_destroy.is_null() || p_enum.is_null() {
                FreeLibrary(lib);
                return false;
            }

            let vk_create_instance: PfnVkCreateInstance = std::mem::transmute(p_create);
            let vk_destroy_instance: PfnVkDestroyInstance = std::mem::transmute(p_destroy);
            let vk_enum_physical_devices: PfnVkEnumeratePhysicalDevices = std::mem::transmute(p_enum);

            let app_info = VkApplicationInfo {
                s_type: 0,
                p_next: std::ptr::null(),
                p_application_name: b"AnF\0".as_ptr() as *const std::ffi::c_char,
                application_version: 1,
                p_engine_name: b"AnF\0".as_ptr() as *const std::ffi::c_char,
                engine_version: 1,
                api_version: 1 << 22,
            };

            let create_info = VkInstanceCreateInfo {
                s_type: 1,
                p_next: std::ptr::null(),
                flags: 0,
                p_application_info: &app_info,
                enabled_layer_count: 0,
                pp_enabled_layer_names: std::ptr::null(),
                enabled_extension_count: 0,
                pp_enabled_extension_names: std::ptr::null(),
            };

            let mut instance: *mut std::ffi::c_void = std::ptr::null_mut();
            let res = vk_create_instance(&create_info, std::ptr::null(), &mut instance);
            if res != 0 || instance.is_null() {
                FreeLibrary(lib);
                return false;
            }

            let mut device_count: u32 = 0;
            let enum_res = vk_enum_physical_devices(instance, &mut device_count, std::ptr::null_mut());
            vk_destroy_instance(instance, std::ptr::null());
            FreeLibrary(lib);

            enum_res == 0 && device_count > 0
        }
    }
    #[cfg(target_os = "linux")]
    {
        extern "C" {
            fn dlopen(filename: *const std::ffi::c_char, flag: std::ffi::c_int) -> *mut std::ffi::c_void;
            fn dlsym(handle: *mut std::ffi::c_void, symbol: *const std::ffi::c_char) -> *mut std::ffi::c_void;
            fn dlclose(handle: *mut std::ffi::c_void) -> std::ffi::c_int;
        }

        unsafe {
            let lib = dlopen(b"libvulkan.so.1\0".as_ptr() as *const std::ffi::c_char, 1);
            if lib.is_null() {
                return false;
            }

            type PfnVkCreateInstance = unsafe extern "C" fn(
                *const VkInstanceCreateInfo,
                *const std::ffi::c_void,
                *mut *mut std::ffi::c_void,
            ) -> i32;
            type PfnVkDestroyInstance = unsafe extern "C" fn(*mut std::ffi::c_void, *const std::ffi::c_void);
            type PfnVkEnumeratePhysicalDevices = unsafe extern "C" fn(
                *mut std::ffi::c_void,
                *mut u32,
                *mut *mut std::ffi::c_void,
            ) -> i32;

            #[repr(C)]
            struct VkApplicationInfo {
                s_type: u32,
                p_next: *const std::ffi::c_void,
                p_application_name: *const std::ffi::c_char,
                application_version: u32,
                p_engine_name: *const std::ffi::c_char,
                engine_version: u32,
                api_version: u32,
            }

            #[repr(C)]
            struct VkInstanceCreateInfo {
                s_type: u32,
                p_next: *const std::ffi::c_void,
                flags: u32,
                p_application_info: *const VkApplicationInfo,
                enabled_layer_count: u32,
                pp_enabled_layer_names: *const *const std::ffi::c_char,
                enabled_extension_count: u32,
                pp_enabled_extension_names: *const *const std::ffi::c_char,
            }

            let p_create = dlsym(lib, b"vkCreateInstance\0".as_ptr() as *const std::ffi::c_char);
            let p_destroy = dlsym(lib, b"vkDestroyInstance\0".as_ptr() as *const std::ffi::c_char);
            let p_enum = dlsym(lib, b"vkEnumeratePhysicalDevices\0".as_ptr() as *const std::ffi::c_char);

            if p_create.is_null() || p_destroy.is_null() || p_enum.is_null() {
                dlclose(lib);
                return false;
            }

            let vk_create_instance: PfnVkCreateInstance = std::mem::transmute(p_create);
            let vk_destroy_instance: PfnVkDestroyInstance = std::mem::transmute(p_destroy);
            let vk_enum_physical_devices: PfnVkEnumeratePhysicalDevices = std::mem::transmute(p_enum);

            let app_info = VkApplicationInfo {
                s_type: 0,
                p_next: std::ptr::null(),
                p_application_name: b"AnF\0".as_ptr() as *const std::ffi::c_char,
                application_version: 1,
                p_engine_name: b"AnF\0".as_ptr() as *const std::ffi::c_char,
                engine_version: 1,
                api_version: 1 << 22,
            };

            let create_info = VkInstanceCreateInfo {
                s_type: 1,
                p_next: std::ptr::null(),
                flags: 0,
                p_application_info: &app_info,
                enabled_layer_count: 0,
                pp_enabled_layer_names: std::ptr::null(),
                enabled_extension_count: 0,
                pp_enabled_extension_names: std::ptr::null(),
            };

            let mut instance: *mut std::ffi::c_void = std::ptr::null_mut();
            let res = vk_create_instance(&create_info, std::ptr::null(), &mut instance);
            if res != 0 || instance.is_null() {
                dlclose(lib);
                return false;
            }

            let mut device_count: u32 = 0;
            let enum_res = vk_enum_physical_devices(instance, &mut device_count, std::ptr::null_mut());
            vk_destroy_instance(instance, std::ptr::null());
            dlclose(lib);

            enum_res == 0 && device_count > 0
        }
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    {
        false
    }
}

impl Drop for Running {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
#[derive(Default)]
pub struct Engine {
    directory: Mutex<Option<PathBuf>>,
    process: Mutex<Option<Running>>,
    reply_lock: tokio::sync::Mutex<()>,
    device: Mutex<Option<String>>,
}
impl Engine {
    pub fn configure(&self, directory: PathBuf) {
        *self.directory.lock().unwrap() = Some(directory);
    }
    pub fn directory(&self) -> Option<PathBuf> {
        let mut directory = self.directory.lock().unwrap();
        if directory.as_ref().is_some_and(|p| pack_available(p)) {
            return directory.clone();
        }
        // An installer/repair can restore the pack after this process started.
        // Never cache a missing pack for the lifetime of the application.
        let portable = std::env::current_exe().ok()
            .and_then(|p| p.parent().map(|p| p.join("local-ai")));
        if let Some(path) = portable.filter(|p| pack_available(p)) {
            *directory = Some(path);
        }
        directory.clone()
    }
    pub fn shutdown(&self) {
        self.process.lock().unwrap().take();
    }
    pub fn device(&self) -> String {
        self.device.lock().unwrap().clone().unwrap_or_else(|| {
            if has_vulkan_device() {
                "GPU (Vulkan)".into()
            } else {
                "CPU".into()
            }
        })
    }

    pub async fn start(&self, profile: &str, context:usize) -> Result<(String, String), String> {
        {
            let mut current = self.process.lock().unwrap();
            if let Some(p) = current.as_mut() {
                if p.profile == profile && p.context==context && p.child.try_wait().map_err(|e| e.to_string())?.is_none()
                {
                    return Ok((p.url.clone(), p.key.clone()));
                }
            }
            current.take();
        }
        let directory = self.directory().ok_or("AnF could not locate its offline pack. Close AnF from its tray menu, then run the full installer again to repair it. Your saved projects and settings are kept.")?;
        let exe = directory.join(if cfg!(windows) {
            "llama-server.exe"
        } else {
            "llama-server"
        });
        let model = crate::model_download::verified_model(profile).unwrap_or_else(|| {
            let single = directory.join("DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic.Q4_K_M.gguf");
            if single.is_file() {
                single
            } else if directory.join("model.gguf").is_file() {
                directory.join("model.gguf")
            } else {
                directory.join("model-fast.gguf")
            }
        });
        if !exe.is_file() || !model.is_file() {
            return Err(format!("The offline pack in {} is incomplete: {} is missing. Run the full installer again to repair it, then reopen AnF. Your saved projects and settings are kept.", directory.display(), if !exe.is_file() { "the local engine" } else { "the selected model" }));
        }
        let use_vulkan = has_vulkan_device();
        *self.device.lock().unwrap() = Some(if use_vulkan { "GPU (Vulkan)".into() } else { "CPU".into() });
        let key = random_key()?;
        let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        drop(listener);
        let mut command = Command::new(exe);
        command
            .current_dir(&directory)
            .args(["-m"])
            .arg(model)
            .args([
                "--host",
                "127.0.0.1",
                "--port",
                &port.to_string(),
                "--api-key",
                &key,
                "--alias",
                "coucou-local",
                "--ctx-size",
                &context.to_string(),
                "--parallel",
                "1",
                "--n-gpu-layers",
                if use_vulkan { "99" } else { "0" },
                "--threads",
                "4",
                "--no-webui",
                "--offline",
                "--log-disable",
                "--jinja",
            ]);
        let template = directory.join("chat-template.jinja");
        if template.is_file() {
            command.arg("--chat-template-file").arg(template);
        }
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let child = platform::no_console(&mut command)
            .spawn()
            .map_err(|e| format!("Could not start the offline model: {e}"))?;
        let url = format!("http://127.0.0.1:{port}");
        *self.process.lock().unwrap() = Some(Running {
            child,
            url: url.clone(),
            key: key.clone(),
            profile: profile.into(),
            context,
        });
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?;
        for _ in 0..120 {
            let alive = self
                .process
                .lock()
                .unwrap()
                .as_mut()
                .and_then(|p| p.child.try_wait().ok())
                .is_some_and(|status| status.is_none());
            if !alive {
                self.shutdown();
                return Err("The offline runtime stopped during startup. Check that this is a Windows x64 computer with enough free memory.".into());
            }
            if let Ok(response) = client
                .get(format!("{url}/v1/models"))
                .bearer_auth(&key)
                .send()
                .await
            {
                if response.status().is_success() {
                    if let Ok(value) = response.json::<Value>().await {
                        if value["data"]
                            .as_array()
                            .is_some_and(|models| models.iter().any(|m| m["id"] == "coucou-local"))
                        {
                            return Ok((url, key));
                        }
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
        self.shutdown();
        Err("The offline model could not finish loading. Free some memory and try again.".into())
    }

    pub async fn reply(&self, messages: &[Value]) -> Result<(String, bool), String> {
        self.reply_profile(messages, "balanced").await
    }
    pub async fn reply_profile(
        &self,
        messages: &[Value],
        profile: &str,
    ) -> Result<(String, bool), String> {
        self.reply_sized(messages,profile,false).await
    }
    pub async fn reply_sized(&self,messages:&[Value],profile:&str,long:bool)->Result<(String,bool),String>{
        supported_profile(profile)?;
        let _turn = self.reply_lock.lock().await;
        let input_bytes:usize=messages.iter().filter_map(|m|m["content"].as_str()).map(str::len).sum();
        let context=if long||input_bytes>6200 {16384}else{8192};
        let (url, key) = self.start(profile,context).await?;
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(if long {1200}else{600}))
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?;
        let response = client.post(format!("{url}/v1/chat/completions")).bearer_auth(key)
            .json(&json!({"model":"coucou-local","messages":messages,"stream":false,"max_tokens":if long{4096}else if profile=="fast"{768}else{1536},
                "temperature":0.7,"chat_template_kwargs":{"enable_thinking":long}}))
            .send().await.map_err(|_|"The local model did not respond. Try again or free some memory.".to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "Offline model error {}. Start a new chat or shorten the question.",
                response.status()
            ));
        }
        let value: Value = response
            .json()
            .await
            .map_err(|_| "Invalid offline model response.".to_string())?;
        let text = value
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        if text.is_empty() {
            return Err("The offline model returned no text. Try a shorter question.".into());
        }
        Ok((
            text,
            value
                .pointer("/choices/0/finish_reason")
                .and_then(Value::as_str)
                == Some("length"),
        ))
    }
    /// Evaluates a spoken question against local AI, supporting both plain speech and OpenAI-style tool calls.
    pub async fn reply_tools(
        &self,
        messages: &[Value],
        tools: Option<&[Value]>,
        profile: &str,
        max_tokens: u32,
        mut on_text: impl FnMut(&str),
    ) -> Result<KevoAskReply, String> {
        supported_profile(profile)?;
        let _turn = self.reply_lock.lock().await;
        let (url, key) = self.start(profile, 8192).await?;
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?;

        let has_tools = tools.is_some_and(|t| !t.is_empty());
        let mut body = json!({
            "model": "coucou-local",
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.3,
            "chat_template_kwargs": {"enable_thinking": false},
            "stream": true
        });

        if has_tools {
            body["tools"] = json!(tools);
            body["tool_choice"] = json!("auto");
        }

        let mut response = client
            .post(format!("{url}/v1/chat/completions"))
            .bearer_auth(&key)
            .json(&body)
            .send()
            .await
            .map_err(|_| "The local model did not respond. Try again or free some memory.".to_string())?;
        if !response.status().is_success() {
            return Err(format!("Offline model error {}.", response.status()));
        }

        let mut pending = Vec::<u8>::new();
        let mut raw_content = String::new();
        let mut tool_acc = Vec::<ToolCallAccumulator>::new();
        let mut filter = StreamToolFilter::default();

        while let Some(chunk) = response.chunk().await.map_err(|_| "The local model stopped answering.".to_string())? {
            pending.extend_from_slice(&chunk);
            while let Some(end) = pending.iter().position(|b| *b == b'\n') {
                let line: Vec<u8> = pending.drain(..=end).collect();
                if let Some(delta) = parse_stream_line(&String::from_utf8_lossy(&line)) {
                    if let Some(content_chunk) = delta.content {
                        raw_content.push_str(&content_chunk);
                        filter.process_chunk(&content_chunk, &mut on_text);
                    }
                    for tc in delta.tool_calls {
                        if tool_acc.len() <= tc.index {
                            tool_acc.resize_with(tc.index + 1, ToolCallAccumulator::default);
                        }
                        let item = &mut tool_acc[tc.index];
                        if let Some(id) = tc.id {
                            item.id = id;
                        }
                        if let Some(name) = tc.name {
                            item.name.push_str(&name);
                        }
                        if let Some(args) = tc.arguments_chunk {
                            item.arguments_buf.push_str(&args);
                        }
                    }
                }
            }
        }
        filter.finish(&mut on_text);

        let mut tool_calls = Vec::new();
        for item in tool_acc {
            if !item.name.is_empty() {
                let args = if !item.arguments_buf.trim().is_empty() {
                    serde_json::from_str::<Value>(&item.arguments_buf).unwrap_or_else(|_| json!({}))
                } else {
                    json!({})
                };
                tool_calls.push(KevoToolCall {
                    name: item.name,
                    arguments: args,
                });
            }
        }

        let (cleaned_text, inline_tool_calls) = parse_tool_calls_and_clean_text(&raw_content);
        for tc in inline_tool_calls {
            if !tool_calls.iter().any(|existing| existing.name == tc.name && existing.arguments == tc.arguments) {
                tool_calls.push(tc);
            }
        }

        let reply = KevoAskReply {
            text: cleaned_text,
            tool_calls,
        };

        if reply.tool_calls.is_empty() && reply.text.is_none() {
            return Err("The offline model returned no text or tool calls. Try asking another way.".into());
        }

        Ok(reply)
    }

    /// A short answer delivered as it is written, for the voice assistant: `on_text` receives each new piece.
    /// Uses the same model process as chat (same profile and context size), so nothing is reloaded.
    pub async fn reply_stream(
        &self,
        messages: &[Value],
        profile: &str,
        max_tokens: u32,
        on_text: impl FnMut(&str),
    ) -> Result<String, String> {
        let reply = self.reply_tools(messages, None, profile, max_tokens, on_text).await?;
        reply.text.ok_or_else(|| "The offline model returned no text. Try asking another way.".into())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KevoToolCall {
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct KevoAskReply {
    pub text: Option<String>,
    #[serde(default)]
    pub tool_calls: Vec<KevoToolCall>,
}

/// Extracts tool calls from `<tool_call>` tags in raw text and strips them, returning cleaned text and tool calls.
pub fn parse_tool_calls_and_clean_text(raw_content: &str) -> (Option<String>, Vec<KevoToolCall>) {
    let mut tool_calls = Vec::new();
    let mut cleaned = raw_content.to_string();

    while let Some(start_idx) = cleaned.find("<tool_call>") {
        let after_start = start_idx + "<tool_call>".len();
        if let Some(end_rel) = cleaned[after_start..].find("</tool_call>") {
            let end_idx = after_start + end_rel;
            let call_block = cleaned[after_start..end_idx].trim();
            if let Ok(parsed) = serde_json::from_str::<Value>(call_block) {
                if let Some(name) = parsed.get("name").and_then(|n| n.as_str()) {
                    let arguments = parsed.get("arguments").cloned().unwrap_or(json!({}));
                    tool_calls.push(KevoToolCall {
                        name: name.to_string(),
                        arguments,
                    });
                }
            }
            cleaned.replace_range(start_idx..end_idx + "</tool_call>".len(), "");
        } else {
            let call_block = cleaned[after_start..].trim();
            if let Ok(parsed) = serde_json::from_str::<Value>(call_block) {
                if let Some(name) = parsed.get("name").and_then(|n| n.as_str()) {
                    let arguments = parsed.get("arguments").cloned().unwrap_or(json!({}));
                    tool_calls.push(KevoToolCall {
                        name: name.to_string(),
                        arguments,
                    });
                }
            }
            cleaned.truncate(start_idx);
            break;
        }
    }

    let cleaned_text = cleaned
        .replace("<tool_call>", "")
        .replace("</tool_call>", "")
        .trim()
        .to_string();

    let text_opt = if cleaned_text.is_empty() {
        None
    } else {
        Some(cleaned_text)
    };

    (text_opt, tool_calls)
}

/// Parses an OpenAI-compatible /v1/chat/completions response value into KevoAskReply.
#[allow(dead_code)]
pub fn parse_kevo_ask_response(value: &Value) -> KevoAskReply {
    let mut tool_calls = Vec::new();

    // 1. OpenAI choices[0].message.tool_calls
    if let Some(calls) = value.pointer("/choices/0/message/tool_calls").and_then(Value::as_array) {
        for c in calls {
            if let Some(name) = c.pointer("/function/name").and_then(Value::as_str) {
                let args = if let Some(arg_str) = c.pointer("/function/arguments").and_then(Value::as_str) {
                    serde_json::from_str::<Value>(arg_str).unwrap_or_else(|_| json!({}))
                } else if let Some(arg_val) = c.pointer("/function/arguments") {
                    arg_val.clone()
                } else {
                    json!({})
                };
                tool_calls.push(KevoToolCall {
                    name: name.to_string(),
                    arguments: args,
                });
            }
        }
    }

    // 2. Parse any raw <tool_call> tags from message.content and clean the text
    let raw_content = value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();

    let (cleaned_text, inline_tool_calls) = parse_tool_calls_and_clean_text(raw_content);
    for tc in inline_tool_calls {
        if !tool_calls.iter().any(|existing| existing.name == tc.name && existing.arguments == tc.arguments) {
            tool_calls.push(tc);
        }
    }

    KevoAskReply {
        text: cleaned_text,
        tool_calls,
    }
}

fn supported_profile(profile: &str) -> Result<(), String> {
    if matches!(
        profile,
        "deepseek-v4-pro-qwen3.5-9b"
            | "default"
            | "local"
            | "fast"
            | "balanced"
            | "deepseek-v4.1-flash"
            | "deepseek-v3.2-reasoning"
            | "deepseek-v3.2"
            | "deepseek-r1-distill-qwen-1.5b"
            | "deepseek-r1-distill"
            | "kimi-k3-thinking"
            | "kimi-k3"
            | "kimi-linear-a3b"
            | "kimi-linear"
    ) {
        Ok(())
    } else {
        Err("Choose a supported model profile.".into())
    }
}

#[derive(Debug, Default, Clone)]
pub struct StreamChunkDelta {
    pub content: Option<String>,
    pub tool_calls: Vec<StreamToolCallDelta>,
}

#[derive(Debug, Clone)]
pub struct StreamToolCallDelta {
    pub index: usize,
    pub id: Option<String>,
    pub name: Option<String>,
    pub arguments_chunk: Option<String>,
}

#[derive(Default, Debug)]
pub struct ToolCallAccumulator {
    pub id: String,
    pub name: String,
    pub arguments_buf: String,
}

/// Parses one line of SSE from /v1/chat/completions into content or tool call deltas.
pub fn parse_stream_line(line: &str) -> Option<StreamChunkDelta> {
    let data = line.trim().strip_prefix("data:")?.trim();
    if data == "[DONE]" || data.is_empty() {
        return None;
    }
    let value: Value = serde_json::from_str(data).ok()?;
    let delta = value.pointer("/choices/0/delta")?;

    let content = delta.get("content")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let mut tool_calls = Vec::new();
    if let Some(calls) = delta.get("tool_calls").and_then(Value::as_array) {
        for c in calls {
            let index = c.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
            let id = c.get("id").and_then(Value::as_str).map(|s| s.to_string());
            let name = c.pointer("/function/name").and_then(Value::as_str).map(|s| s.to_string());
            let arguments_chunk = c.pointer("/function/arguments").and_then(Value::as_str).map(|s| s.to_string());
            if name.is_some() || arguments_chunk.is_some() || id.is_some() {
                tool_calls.push(StreamToolCallDelta {
                    index,
                    id,
                    name,
                    arguments_chunk,
                });
            }
        }
    }

    if content.is_some() || !tool_calls.is_empty() {
        Some(StreamChunkDelta { content, tool_calls })
    } else {
        None
    }
}

/// Returns the length of the longest suffix of `s` that matches a non-empty prefix of `tag`.
pub fn find_tag_prefix_len(s: &str, tag: &str) -> usize {
    for len in (1..=tag.len().min(s.len())).rev() {
        if s.ends_with(&tag[..len]) {
            return len;
        }
    }
    0
}

/// Buffers text chunks to withhold `<tool_call>...</tool_call>` blocks while immediately
/// forwarding conversational text to `on_text`.
#[derive(Default, Debug)]
pub struct StreamToolFilter {
    buffer: String,
    in_tool_call: bool,
}

impl StreamToolFilter {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self::default()
    }

    pub fn process_chunk<F: FnMut(&str)>(&mut self, chunk: &str, mut on_text: F) {
        self.buffer.push_str(chunk);
        loop {
            if !self.in_tool_call {
                if let Some(idx) = self.buffer.find("<tool_call>") {
                    if idx > 0 {
                        let text = self.buffer[..idx].to_string();
                        on_text(&text);
                    }
                    self.buffer.drain(..idx);
                    self.in_tool_call = true;
                    continue;
                }
                let prefix_len = find_tag_prefix_len(&self.buffer, "<tool_call>");
                if prefix_len > 0 {
                    let safe_len = self.buffer.len() - prefix_len;
                    if safe_len > 0 {
                        let text = self.buffer[..safe_len].to_string();
                        self.buffer.drain(..safe_len);
                        on_text(&text);
                    }
                    break;
                } else {
                    if !self.buffer.is_empty() {
                        let text = std::mem::take(&mut self.buffer);
                        on_text(&text);
                    }
                    break;
                }
            } else {
                if let Some(end_rel) = self.buffer.find("</tool_call>") {
                    let end_idx = end_rel + "</tool_call>".len();
                    self.buffer.drain(..end_idx);
                    self.in_tool_call = false;
                    continue;
                }
                break;
            }
        }
    }

    pub fn finish<F: FnMut(&str)>(mut self, mut on_text: F) {
        if !self.in_tool_call && !self.buffer.is_empty() {
            on_text(&self.buffer);
            self.buffer.clear();
        }
    }
}

#[allow(dead_code)]
/// The text carried by one line of a streamed chat completion ("data: {json}"), if any.
pub fn stream_delta(line: &str) -> Option<String> {
    parse_stream_line(line).and_then(|d| d.content)
}

#[allow(dead_code)]
/// Takes the complete sentences off the front of `buffer`, leaving the unfinished remainder in it.
pub fn take_sentences(buffer: &mut String) -> Option<String> {
    let bytes = buffer.as_bytes();
    let cut = (0..bytes.len()).rev().find(|&i| {
        matches!(bytes[i], b'.' | b'!' | b'?') && bytes.get(i + 1).is_some_and(|b| b.is_ascii_whitespace())
            // "3.5" or "e.g." mid-number/abbreviation is not an end; a sentence is at least a few words long
            && i >= 12
    })?;
    let done = buffer[..=cut].trim().to_string();
    *buffer = buffer[cut + 1..].trim_start().to_string();
    Some(done)
}

/// Takes complete sentences off the front of `buffer`, ensuring that incomplete
/// `<tool_call` tags are withheld and never sliced into.
pub fn take_streamable_sentences(buffer: &mut String) -> Option<String> {
    let limit = buffer.find('<').unwrap_or(buffer.len());
    if limit < 12 {
        return None;
    }
    let slice = &buffer[..limit];
    let bytes = slice.as_bytes();
    let cut = (0..bytes.len()).rev().find(|&i| {
        matches!(bytes[i], b'.' | b'!' | b'?')
            && (i + 1 == limit || bytes.get(i + 1).is_some_and(|b| b.is_ascii_whitespace()))
            && i >= 10
    })?;
    let done = buffer[..=cut].trim().to_string();
    *buffer = buffer[cut + 1..].trim_start().to_string();
    (!done.is_empty()).then_some(done)
}

pub(crate) fn random_key() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    #[cfg(windows)]
    {
        #[link(name = "bcrypt")]
        extern "system" {
            fn BCryptGenRandom(
                algorithm: *mut std::ffi::c_void,
                buffer: *mut u8,
                count: u32,
                flags: u32,
            ) -> i32;
        }
        let result = unsafe {
            BCryptGenRandom(
                std::ptr::null_mut(),
                bytes.as_mut_ptr(),
                bytes.len() as u32,
                2,
            )
        };
        if result < 0 {
            return Err("Could not secure the local AI connection.".into());
        }
    }
    #[cfg(not(windows))]
    {
        use std::io::Read;
        std::fs::File::open("/dev/urandom")
            .and_then(|mut f| f.read_exact(&mut bytes))
            .map_err(|e| e.to_string())?;
    }
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Keep the local prompt well inside its finite context, even for UTF-8 input.
/// Old turns are dropped whole; oversized new questions are shortened explicitly.
pub fn bounded_messages(history: &[Value], query: &str) -> (Vec<Value>, bool) {
    let system = json!({"role":"system","content":"You are Mochi, an offline assistant. Answer clearly in the user's language. Do not claim web access. /no_think"});
    let question = truncate_utf8(query, 11000);
    let mut remaining = 11500usize.saturating_sub(question.len());
    let mut retained = Vec::new();
    for message in history.iter().rev().take(20) {
        let text = message["content"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|p| p["text"].as_str())
            .collect::<Vec<_>>()
            .join("\n");
        if text.len() > remaining {
            break;
        }
        remaining -= text.len();
        retained.push(json!({"role":message["role"],"content":text}));
    }
    retained.reverse();
    // A conversation should start with a user turn, never an orphaned answer.
    while retained.first().is_some_and(|m| m["role"] != "user") {
        retained.remove(0);
    }
    let trimmed = retained.len() < history.len() || question.len() < query.len();
    let mut messages = vec![system];
    messages.extend(retained);
    messages.push(json!({"role":"user","content":question}));
    (messages, trimmed)
}
fn truncate_utf8(text: &str, max: usize) -> &str {
    let mut end = text.len().min(max);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

/// Retain the ending of a long answer so a short "continue" prompt still works.
pub fn history_reply(text: &str) -> (String, bool) {
    if text.len() <= 2000 {
        return (text.to_string(), false);
    }
    let mut start = text.len() - 2000;
    while !text.is_char_boundary(start) {
        start += 1;
    }
    (format!("[Earlier reply omitted]\n{}", &text[start..]), true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repaired_pack_is_detected_without_restarting() {
        let root = std::env::temp_dir().join(format!("coucou-pack-repair-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let e = Engine::default();
        e.configure(root.clone());
        assert!(!pack_available(&root));
        std::fs::write(root.join(if cfg!(windows) { "llama-server.exe" } else { "llama-server" }), b"fixture").unwrap();
        std::fs::write(root.join("model-fast.gguf"), b"fixture").unwrap();
        assert!(pack_available(&e.directory().unwrap()));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    #[ignore = "runs both bundled CPU models"]
    fn switches_between_fast_and_balanced_models_without_keys() {
        let e = Engine::default();
        e.configure(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../local-ai"));
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let messages = vec![
            json!({"role":"user","content":"What is 2 plus 2? Reply with the number only. /no_think"}),
        ];
        for profile in ["fast", "balanced"] {
            let (reply, _) = rt.block_on(e.reply_profile(&messages, profile)).unwrap();
            assert!(reply.contains('4'), "{profile}: {reply}");
            assert_eq!(e.process.lock().unwrap().as_ref().unwrap().profile, profile);
        }
        e.shutdown();
        assert!(e.process.lock().unwrap().is_none());
    }
    #[test]
    #[ignore = "streams from the real bundled model"]
    fn streams_a_short_answer_from_the_real_model() {
        let e = Engine::default();
        e.configure(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../local-ai"));
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let messages = vec![json!({"role":"user","content":"Count from one to five in words, then say what 2 plus 2 is. /no_think"})];
        // Load the model first, so the timing below is about answering, not loading.
        rt.block_on(e.reply_profile(&[json!({"role":"user","content":"Say OK. /no_think"})], "fast")).unwrap();
        let (started, mut first, mut pieces) = (std::time::Instant::now(), None, 0);
        let text = rt.block_on(e.reply_stream(&messages, "fast", 160, |_| {
            first.get_or_insert_with(|| started.elapsed());
            pieces += 1;
        })).unwrap();
        assert!(pieces > 1, "the answer arrived in one piece, so nothing was streamed: {text}");
        assert!(text.contains('4') || text.to_lowercase().contains("four"), "{text}");
        println!("Kevo stream live check: first words after {:?}, whole answer after {:?}, {pieces} pieces", first.unwrap(), started.elapsed());
        e.shutdown();
    }
    #[test]
    #[ignore = "starts and cancels real local inference"]
    fn cancellation_stops_the_owned_model_process() {
        let e = Engine::default();
        e.configure(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../local-ai"));
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async{let messages=vec![json!({"role":"user","content":"Write a very long story about a forest. /no_think"})];tokio::select!{_ = e.reply_profile(&messages,"fast")=>panic!("Inference ended before cancellation test"),_ = tokio::time::sleep(std::time::Duration::from_secs(2))=>{e.shutdown();}}});
        assert!(e.process.lock().unwrap().is_none());
    }
    #[test]
    fn budgets_unicode_and_drops_whole_old_turns() {
        let long = "😀".repeat(4000);
        let h = vec![
            json!({"role":"user","content":[{"text":"old".repeat(3000)}]}),
            json!({"role":"assistant","content":[{"text":"answer"}]}),
        ];
        let (messages, trimmed) = bounded_messages(&h, &long);
        assert!(trimmed);
        assert_eq!(messages.len(), 2);
        assert!(messages[1]["content"].as_str().unwrap().len() <= 11000);
        assert!(messages[1]["content"].as_str().unwrap().ends_with('😀'));
    }
    #[test]
    fn local_authentication_keys_are_random_and_never_persistent() {
        let a = random_key().unwrap();
        let b = random_key().unwrap();
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
    }
    #[test]
    #[ignore = "runs the real bundled model with a long response budget"]
    fn long_response_uses_expanded_context() {
        let e=Engine::default();e.configure(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../local-ai"));
        let rt=tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let messages=vec![json!({"role":"user","content":"Write an approximately 1700-word practical guide to building a weekly reading habit, with eight developed sections and examples. Keep writing until all sections are developed; do not claim or print a word count. /no_think"})];
        let (text,incomplete)=rt.block_on(e.reply_sized(&messages,"fast",true)).unwrap();
        assert!(!text.trim().is_empty());
        assert_eq!(e.process.lock().unwrap().as_ref().unwrap().context,16384);
        println!("Long-response live check: {} words, token-limit reached: {}",text.split_whitespace().count(),incomplete);
        e.shutdown();
    }
    #[test]
    fn continuation_retains_the_ending_of_a_long_answer() {
        let (reply, shortened) = history_reply(&format!("{}ENDING", "😀".repeat(2000)));
        assert!(shortened);
        let history = vec![
            json!({"role":"user","content":[{"text":"question"}]}),
            json!({"role":"assistant","content":[{"text":reply}]}),
        ];
        let (messages, _) = bounded_messages(&history, "Please continue");
        assert_eq!(messages.len(), 4);
        assert!(messages[2]["content"].as_str().unwrap().ends_with("ENDING"));
    }
    #[test]
    fn parses_single_and_chained_tool_calls_and_cleans_tags() {
        let raw = "<tool_call>\n{\"name\": \"open_app\", \"arguments\": {\"name\": \"Brave\"}}\n</tool_call>\n<tool_call>\n{\"name\": \"youtube_search\", \"arguments\": {\"query\": \"lofi\"}}\n</tool_call>";
        let (text, calls) = parse_tool_calls_and_clean_text(raw);
        assert_eq!(text, None);
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].name, "open_app");
        assert_eq!(calls[0].arguments["name"], "Brave");
        assert_eq!(calls[1].name, "youtube_search");
        assert_eq!(calls[1].arguments["query"], "lofi");

        // Plain text with no tool call
        let plain = "The sky is blue due to Rayleigh scattering.";
        let (t_plain, c_plain) = parse_tool_calls_and_clean_text(plain);
        assert_eq!(t_plain, Some(plain.to_string()));
        assert!(c_plain.is_empty());

        // Text mixed with tool call
        let mixed = "Opening your browser now: <tool_call>{\"name\":\"open_app\",\"arguments\":{\"name\":\"Chrome\"}}</tool_call>";
        let (t_mix, c_mix) = parse_tool_calls_and_clean_text(mixed);
        assert_eq!(t_mix, Some("Opening your browser now:".to_string()));
        assert_eq!(c_mix.len(), 1);
        assert_eq!(c_mix[0].name, "open_app");
        assert_eq!(c_mix[0].arguments["name"], "Chrome");
        assert!(!t_mix.unwrap().contains("<tool_call>"), "no raw tag leaks");
    }
    #[test]
    fn parses_openai_tool_calls_response() {
        let resp = json!({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [
                        {
                            "type": "function",
                            "function": {
                                "name": "open_site",
                                "arguments": "{\"url\":\"https://github.com\"}"
                            }
                        }
                    ]
                }
            }]
        });
        let parsed = parse_kevo_ask_response(&resp);
        assert_eq!(parsed.text, None);
        assert_eq!(parsed.tool_calls.len(), 1);
        assert_eq!(parsed.tool_calls[0].name, "open_site");
        assert_eq!(parsed.tool_calls[0].arguments["url"], "https://github.com");
    }
    #[test]
    fn tag_prefix_matching_identifies_partial_tool_tags() {
        assert_eq!(find_tag_prefix_len("hello <", "<tool_call>"), 1);
        assert_eq!(find_tag_prefix_len("hello <tool", "<tool_call>"), 5);
        assert_eq!(find_tag_prefix_len("hello <tool_call", "<tool_call>"), 10);
        assert_eq!(find_tag_prefix_len("hello <tool_call>", "<tool_call>"), 11);
        assert_eq!(find_tag_prefix_len("hello world", "<tool_call>"), 0);
        assert_eq!(find_tag_prefix_len("temperature < 10", "<tool_call>"), 0);
    }
    #[test]
    fn stream_tool_filter_withholds_tool_calls_and_streams_text() {
        let mut filter = StreamToolFilter::new();
        let mut streamed = Vec::new();

        // 1. Pure text streaming
        filter.process_chunk("Hello, ", |t| streamed.push(t.to_string()));
        filter.process_chunk("world!", |t| streamed.push(t.to_string()));
        filter.finish(|t| streamed.push(t.to_string()));
        assert_eq!(streamed.concat(), "Hello, world!");

        // 2. Pure tool call streaming - should NOT emit any tool tags or content
        let mut filter2 = StreamToolFilter::new();
        let mut streamed2 = Vec::new();
        filter2.process_chunk("<tool", |t| streamed2.push(t.to_string()));
        assert!(streamed2.is_empty(), "withheld partial opening tag");
        filter2.process_chunk("_call>\n{\"name\":\"timer_set\"}\n</tool_call>", |t| streamed2.push(t.to_string()));
        filter2.finish(|t| streamed2.push(t.to_string()));
        assert!(streamed2.is_empty(), "entire tool call was swallowed");

        // 3. Conversational intro preceding tool call - intro emits immediately
        let mut filter3 = StreamToolFilter::new();
        let mut streamed3 = Vec::new();
        filter3.process_chunk("Setting a timer for you now. <tool", |t| streamed3.push(t.to_string()));
        assert_eq!(streamed3.concat(), "Setting a timer for you now. ");
        filter3.process_chunk("_call>{\"name\":\"timer_set\"}</tool_call>", |t| streamed3.push(t.to_string()));
        filter3.finish(|t| streamed3.push(t.to_string()));
        assert_eq!(streamed3.concat(), "Setting a timer for you now. ");

        // 4. Text following tool call
        let mut filter4 = StreamToolFilter::new();
        let mut streamed4 = Vec::new();
        filter4.process_chunk("<tool_call>{\"name\":\"app\"}</tool_call>All done, sir.", |t| streamed4.push(t.to_string()));
        filter4.finish(|t| streamed4.push(t.to_string()));
        assert_eq!(streamed4.concat(), "All done, sir.");
    }
    #[test]
    fn parse_stream_line_extracts_deltas_and_tool_calls() {
        let content_line = r#"data: {"choices":[{"delta":{"content":"Good morning!"}}]}"#;
        let delta = parse_stream_line(content_line).unwrap();
        assert_eq!(delta.content.as_deref(), Some("Good morning!"));
        assert!(delta.tool_calls.is_empty());

        let tool_line = r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"open_app","arguments":"{\"name\":"}}]}}]}"#;
        let delta2 = parse_stream_line(tool_line).unwrap();
        assert_eq!(delta2.tool_calls.len(), 1);
        assert_eq!(delta2.tool_calls[0].index, 0);
        assert_eq!(delta2.tool_calls[0].name.as_deref(), Some("open_app"));
        assert_eq!(delta2.tool_calls[0].arguments_chunk.as_deref(), Some("{\"name\":"));

        let done_line = "data: [DONE]";
        assert!(parse_stream_line(done_line).is_none());
    }
    #[test]
    fn take_streamable_sentences_guards_against_partial_tags() {
        let mut buf = "I will check that for you right away. <tool_call>{\"name\":\"weather\"}".to_string();
        let s = take_streamable_sentences(&mut buf);
        assert_eq!(s, Some("I will check that for you right away.".to_string()));
        assert_eq!(buf, "<tool_call>{\"name\":\"weather\"}");

        let s2 = take_streamable_sentences(&mut buf);
        assert_eq!(s2, None);

        let mut buf2 = "First sentence here. Second sentence starts".to_string();
        let s3 = take_streamable_sentences(&mut buf2);
        assert_eq!(s3, Some("First sentence here.".to_string()));
        assert_eq!(buf2, "Second sentence starts");
    }
}
