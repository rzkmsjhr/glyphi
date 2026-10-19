use serde::{Deserialize, Serialize};

fn default_theme() -> String {
    "dark".to_string()
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub provider: String, // "gemini" | "chatgpt"
    #[serde(default = "default_theme")]
    pub theme: String, // "dark" | "light"
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
    #[serde(default = "default_true")]
    pub show_romanization: bool,
    #[serde(default = "default_true")]
    pub autostart: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            provider: "gemini".to_string(),
            theme: "dark".to_string(),
            gemini_api_key: String::new(),
            gemini_model: "gemini-3.5-flash-lite".to_string(),
            openai_api_key: String::new(),
            openai_model: "gpt-4o-mini".to_string(),
            target_language: "English".to_string(),
            auto_trigger_selection: true,
            auto_trigger_pause: false, // off by default until user opts in
            pause_delay_ms: 1500,
            global_shortcut: "Alt+G".to_string(),
            grammar_prompt: "You are a professional editor. Correct all grammar, spelling, punctuation, and phrasing errors in the original language of the text. Preserve original language, tone, and formatting. Return ONLY the corrected text.".to_string(),
            translate_prompt: "You are an expert translator. Translate the text into {target_language}. Maintain natural idioms, context, and tone. Return ONLY the translated text.".to_string(),
            rewrite_prompt: "Rewrite the following text in its original language to be concise, polished, and professional. Preserve the original language and tone. Return ONLY the rewritten text.".to_string(),
            show_romanization: true,
            autostart: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessTextRequest {
    pub action: String, // "grammar" | "translate" | "rewrite"
    pub text: String,
    #[serde(alias = "targetLanguage")]
    pub target_language: Option<String>,
    #[serde(alias = "customPrompt")]
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transliteration: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerEventPayload {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub trigger_type: String, // "selection" | "pause" | "shortcut"
}
