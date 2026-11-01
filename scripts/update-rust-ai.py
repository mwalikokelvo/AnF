import os

p_cmd = r'C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows\src-tauri\src\workspace_commands.rs'
with open(p_cmd, 'r', encoding='utf-8') as f:
    c = f.read()

target = """        if model == "fast" {
            "Fast · Qwen3 0.6B"
        } else {
            "Balanced · Qwen3 1.7B"
        }"""

replacement = """        match model.as_str() {
            "deepseek-v4.1-flash" => "DeepSeek V4.1 Flash (1017 · Engram)",
            "deepseek-v3.2-reasoning" | "deepseek-v3.2" => "DeepSeek V3.2 Reasoning (DSA)",
            "deepseek-r1-distill-qwen-1.5b" | "deepseek-r1-distill" => "DeepSeek R1 Distill 1.5B (Edge)",
            "kimi-k3-thinking" | "kimi-k3" => "Kimi K3 Thinking (KDA · MoE)",
            "kimi-linear-a3b" | "kimi-linear" => "Kimi Linear 48B-A3B (Edge Fast)",
            "fast" => "Fast · Qwen3 0.6B",
            _ => "Balanced · Qwen3 1.7B",
        }"""

if target in c:
    c = c.replace(target, replacement, 1)
    with open(p_cmd, 'w', encoding='utf-8') as f:
        f.write(c)
    print("Updated workspace_commands.rs successfully")
else:
    print("Target not found in workspace_commands.rs")

p_local = r'C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows\src-tauri\src\local_ai.rs'
with open(p_local, 'r', encoding='utf-8') as f:
    cl = f.read()

target_local = """    pub async fn reply_sized(&self,messages:&[Value],profile:&str,long:bool)->Result<(String,bool),String>{
        if !matches!(profile, "fast" | "balanced") {
            return Err("Choose Fast or Balanced.".into());
        }"""

replacement_local = """    pub async fn reply_sized(&self,messages:&[Value],profile:&str,long:bool)->Result<(String,bool),String>{
        if !matches!(profile, "fast" | "balanced" | "deepseek-v4.1-flash" | "deepseek-v3.2-reasoning" | "deepseek-v3.2" | "deepseek-r1-distill-qwen-1.5b" | "deepseek-r1-distill" | "kimi-k3-thinking" | "kimi-k3" | "kimi-linear-a3b" | "kimi-linear") {
            return Err("Choose a supported model profile.".into());
        }"""

target_model_path = """        let model = directory.join(if profile == "fast" {
            "model-fast.gguf"
        } else {
            "model.gguf"
        });"""

replacement_model_path = """        let is_fast_slot = matches!(profile, "fast" | "deepseek-v4.1-flash" | "deepseek-r1-distill-qwen-1.5b" | "deepseek-r1-distill" | "kimi-linear-a3b" | "kimi-linear");
        let model = directory.join(if is_fast_slot {
            if directory.join("model-fast.gguf").is_file() { "model-fast.gguf" } else { "model.gguf" }
        } else {
            "model.gguf"
        });"""

if target_local in cl:
    cl = cl.replace(target_local, replacement_local, 1)
    if target_model_path in cl:
        cl = cl.replace(target_model_path, replacement_model_path, 1)
    with open(p_local, 'w', encoding='utf-8') as f:
        f.write(cl)
    print("Updated local_ai.rs successfully")
else:
    print("Target not found in local_ai.rs")
