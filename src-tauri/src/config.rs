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
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(mut settings) = serde_json::from_str::<AppSettings>(&content) {
                    if settings.gemini_model == "gemini-2.0-flash"
                        || settings.gemini_model == "gemini-3.8-flash"
                        || settings.gemini_model == "gemini-2.5-flash"
                        || settings.gemini_model == "gemini-1.5-flash"
                        || settings.gemini_model.is_empty()
                    {
                        settings.gemini_model = "gemini-3.5-flash-lite".to_string();
                    }
                    return settings;
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
