use crate::models::AppSettings;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {}", e))?;
    
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    
    Ok(app_dir.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> AppSettings {
    if let Ok(path) = get_config_path(app) {
        if path.exists() {
            match fs::read_to_string(&path) {
                Ok(content) => match serde_json::from_str::<AppSettings>(&content) {
                    Ok(mut settings) => {
                        if settings.gemini_model == "gemini-2.0-flash"
                            || settings.gemini_model == "gemini-3.8-flash"
                            || settings.gemini_model == "gemini-2.5-flash"
                            || settings.gemini_model == "gemini-1.5-flash"
                            || settings.gemini_model.is_empty()
                        {
                            settings.gemini_model = "gemini-3.5-flash-lite".to_string();
                        }
                        if settings.rewrite_prompt == "Rewrite the following text to be concise, polished, and professional. Return ONLY the rewritten text." {
                            settings.rewrite_prompt = "Rewrite the following text in its original language to be concise, polished, and professional. Preserve the original language and tone. Return ONLY the rewritten text.".to_string();
                        }
                        if settings.grammar_prompt == "You are a professional editor. Correct all grammar, spelling, punctuation, and phrasing errors. Preserve original tone and formatting. Return ONLY the corrected text." {
                            settings.grammar_prompt = "You are a professional editor. Correct all grammar, spelling, punctuation, and phrasing errors in the original language of the text. Preserve original language, tone, and formatting. Return ONLY the corrected text.".to_string();
                        }
                        return settings;
                    }
                    Err(e) => {
                        eprintln!("[Glyphi] Failed to parse settings.json ({}), falling back to defaults", e);
                    }
                },
                Err(e) => {
                    eprintln!("[Glyphi] Failed to read settings.json ({}), falling back to defaults", e);
                }
            }
        }
    }
    AppSettings::default()
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = get_config_path(app)?;
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write settings file: {}", e))?;
    Ok(())
}

pub fn reset_settings(app: &AppHandle) -> Result<AppSettings, String> {
    let defaults = AppSettings::default();
    save_settings(app, &defaults)?;
    Ok(defaults)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_empty_json() {
        let s: AppSettings = serde_json::from_str("{}").expect("empty json should deserialize with defaults");
        assert_eq!(s.provider, "gemini");
        assert_eq!(s.gemini_model, "gemini-3.5-flash-lite");
        assert_eq!(s.global_shortcut, "Alt+G");
        assert!(s.show_romanization);
        assert!(s.autostart);
    }

    #[test]
    fn test_deserialize_partial_json() {
        let json = r#"{"provider": "gemini", "gemini_api_key": "test_key"}"#;
        let s: AppSettings = serde_json::from_str(json).expect("partial json should deserialize with defaults");
        assert_eq!(s.gemini_api_key, "test_key");
        assert_eq!(s.target_language, "English");
        assert_eq!(s.theme, "dark");
    }
}
