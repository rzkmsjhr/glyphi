use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub provider: String, // "gemini" | "chatgpt"
    pub gemini_api_key: String,
    pub gemini_model: String, // e.g. "gemini-2.0-flash", "gemini-1.5-flash"
    pub openai_api_key: String,
    pub openai_model: String, // e.g. "gpt-4o-mini", "gpt-4o"
    pub target_language: String, // e.g. "English", "Indonesian", "Spanish", "Japanese"
    pub auto_trigger_selection: bool,
    pub auto_trigger_pause: bool,
    pub pause_delay_ms: u64,
    pub global_shortcut: String,
    pub grammar_prompt: String,
    pub translate_prompt: String,
    pub rewrite_prompt: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            provider: "gemini".to_string(),
            gemini_api_key: String::new(),
            gemini_model: "gemini-3.8-flash".to_string(),
            openai_api_key: String::new(),
            openai_model: "gpt-4o-mini".to_string(),
            target_language: "English".to_string(),
            auto_trigger_selection: true,
            auto_trigger_pause: false, // off by default until user opts in
            pause_delay_ms: 1500,
            global_shortcut: "Alt+G".to_string(),
            grammar_prompt: "You are a professional editor. Correct all grammar, spelling, punctuation, and phrasing errors. Preserve original tone and formatting. Return ONLY the corrected text.".to_string(),
            translate_prompt: "You are an expert translator. Translate the text into {target_language}. Maintain natural idioms, context, and tone. Return ONLY the translated text.".to_string(),
            rewrite_prompt: "Rewrite the following text to be concise, polished, and professional. Return ONLY the rewritten text.".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessTextRequest {
    pub action: String, // "grammar" | "translate" | "rewrite"
    pub text: String,
    pub target_language: Option<String>,
    pub custom_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffItem {
    pub op: String, // "equal" | "insert" | "delete"
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessTextResponse {
    pub original: String,
    pub result: String,
    pub action: String,
    pub diff: Vec<DiffItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerEventPayload {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub trigger_type: String, // "selection" | "pause" | "shortcut"
}
