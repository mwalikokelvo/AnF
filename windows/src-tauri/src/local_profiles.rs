//! Stable inference slots. Historical request aliases never prove installed weights.
pub fn slot(profile: &str) -> Option<&'static str> {
    match profile {
        "fast" | "deepseek-v4.1-flash" | "deepseek-r1-distill-qwen-1.5b" | "deepseek-r1-distill" | "kimi-linear-a3b" | "kimi-linear" => Some("fast"),
        "balanced" | "deepseek-v3.2-reasoning" | "deepseek-v3.2" | "kimi-k3-thinking" | "kimi-k3" => Some("balanced"),
        _ => None,
    }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn native_slot_ids_are_stable() {assert_eq!(slot("fast"),Some("fast"));assert_eq!(slot("balanced"),Some("balanced"));}
    #[test] fn old_aliases_describe_slots_not_installed_model_identity() {
        for value in ["deepseek-v4.1-flash","deepseek-r1-distill-qwen-1.5b","deepseek-r1-distill","kimi-linear-a3b","kimi-linear"] {assert_eq!(slot(value),Some("fast"));}
        for value in ["deepseek-v3.2-reasoning","deepseek-v3.2","kimi-k3-thinking","kimi-k3"] {assert_eq!(slot(value),Some("balanced"));}
    }
    #[test] fn arbitrary_model_names_do_not_enable_inference() {for value in ["","unknown","FAST","../../model.gguf"] {assert_eq!(slot(value),None);}}
}
