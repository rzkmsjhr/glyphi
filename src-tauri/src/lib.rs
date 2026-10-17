mod ai;
mod clipboard;
mod config;
mod listener;
mod models;

use ai::AiService;
use clipboard::{set_clipboard_text, simulate_copy, simulate_paste};
use config::{load_settings, save_settings as persist_settings};
use listener::{show_widget_at, start_global_listener};
use models::{AppSettings, ProcessTextRequest, ProcessTextResponse};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, State,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub struct AppState {
    pub settings: Arc<Mutex<AppSettings>>,
    pub ai: AiService,
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> AppSettings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<(), String> {
    persist_settings(&app, &settings)?;
    let mut current = state.settings.lock().unwrap();
    let theme = settings.theme.clone();
    *current = settings;
    let _ = app.emit("theme-changed", theme);
    Ok(())
}

#[tauri::command]
async fn test_api_connection(
    state: State<'_, AppState>,
    provider: String,
    api_key: String,
    model: String,
) -> Result<String, String> {
    state.ai.test_connection(&provider, &api_key, &model).await
}

#[tauri::command]
async fn process_text(
    state: State<'_, AppState>,
    req: ProcessTextRequest,
) -> Result<ProcessTextResponse, String> {
    let settings = state.settings.lock().unwrap().clone();
    state.ai.process_text(&settings, &req).await
}

#[tauri::command]
fn apply_replacement(app: AppHandle, new_text: String) -> Result<(), String> {
    // Hide widget first so target app regains focus
    if let Some(window) = app.get_webview_window("floating") {
        let _ = window.hide();
    }
    // Give OS time to reactivate target window
    std::thread::sleep(std::time::Duration::from_millis(120));
    simulate_paste(&new_text)
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<(), String> {
    set_clipboard_text(&text)
}

#[tauri::command]
fn grab_selected_text() -> Result<String, String> {
    simulate_copy()
}

#[tauri::command]
fn hide_floating_widget(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("floating") {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
fn resize_floating_widget(app: AppHandle, width: u32, height: u32) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("floating") {
        let logical_w = width as f64;
        let logical_h = height as f64;

        let _ = window.set_size(Size::Logical(LogicalSize {
            width: logical_w,
            height: logical_h,
        }));

        // Adjust position so that expanding near screen edges does not get cut off
        if let Ok(Some(monitor)) = window.current_monitor() {
            let scale = monitor.scale_factor();
            let screen_pos = monitor.position();
            let screen_size = monitor.size();

            let monitor_x = screen_pos.x;
            let monitor_y = screen_pos.y;
            let monitor_right = monitor_x + screen_size.width as i32;
            let monitor_bottom = monitor_y + screen_size.height as i32;

            let physical_w = (logical_w * scale) as i32;
            let physical_h = (logical_h * scale) as i32;
            let margin = (16.0 * scale) as i32;

            if let Ok(cur_pos) = window.outer_position() {
                let mut new_x = cur_pos.x;
                let mut new_y = cur_pos.y;

                if new_x + physical_w > monitor_right - margin {
                    new_x = monitor_right - physical_w - margin;
                }
                if new_y + physical_h > monitor_bottom - margin {
                    new_y = monitor_bottom - physical_h - margin;
                }

                new_x = new_x.max(monitor_x + margin);
                new_y = new_y.max(monitor_y + margin);

                if new_x != cur_pos.x || new_y != cur_pos.y {
                    let _ = window.set_position(Position::Physical(PhysicalPosition {
                        x: new_x,
                        y: new_y,
                    }));
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn minimize_to_tray(app: AppHandle) -> Result<(), String> {
    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.hide();
    }
    Ok(())
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let initial_settings = load_settings(&handle);
            let settings_arc = Arc::new(Mutex::new(initial_settings.clone()));

            // Explicitly set the window icon for taskbar and titlebar (high-res 256x256)
            if let Some(main_window) = app.get_webview_window("main") {
                let icon_bytes = include_bytes!("../icons/128x128@2x.png");
                if let Ok(img) = image::load_from_memory(icon_bytes) {
                    let rgba = img.to_rgba8();
                    let (w, h) = rgba.dimensions();
                    let tauri_img = tauri::image::Image::new_owned(rgba.into_raw(), w, h);
                    let _ = main_window.set_icon(tauri_img);
                }
            }

            // Ensure floating window has no native OS shadow or rectangular DWM frame
            if let Some(floating_window) = app.get_webview_window("floating") {
                let _ = floating_window.set_shadow(false);

                #[cfg(target_os = "windows")]
                {
                    if let Ok(hwnd) = floating_window.hwnd() {
                        unsafe {
                            #[link(name = "dwmapi")]
                            unsafe extern "system" {
                                fn DwmSetWindowAttribute(
                                    hwnd: *mut std::ffi::c_void,
                                    dwAttribute: u32,
                                    pvAttribute: *const std::ffi::c_void,
                                    cbAttribute: u32,
                                ) -> i32;
                            }
                            // DWMWA_WINDOW_CORNER_PREFERENCE = 33, DWMWCP_DONOTROUND = 1
                            let corner_pref: u32 = 1;
                            let _ = DwmSetWindowAttribute(
                                hwnd.0,
                                33,
                                &corner_pref as *const _ as *const _,
                                std::mem::size_of::<u32>() as u32,
                            );
                            // DWMWA_BORDER_COLOR = 34, DWMWA_COLOR_NONE = 0xFFFFFFFE
                            let border_color: u32 = 0xFFFFFFFE;
                            let _ = DwmSetWindowAttribute(
                                hwnd.0,
                                34,
                                &border_color as *const _ as *const _,
                                std::mem::size_of::<u32>() as u32,
                            );
                        }
                    }
                }
            }

            app.manage(AppState {
                settings: settings_arc.clone(),
                ai: AiService::new(),
            });

            // Start global mouse / keyboard pause listener
            start_global_listener(handle.clone(), settings_arc.clone());

            // Initialize global hotkey (e.g. Alt+G)
            let shortcut_str = initial_settings.global_shortcut.clone();
            if let Ok(shortcut) = shortcut_str.parse::<Shortcut>() {
                let handle_clone = handle.clone();
                let _ = app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |_app, s, event| {
                            if s == &shortcut && event.state() == ShortcutState::Pressed {
                                let app = handle_clone.clone();
                                std::thread::spawn(move || {
                                    let text = simulate_copy().unwrap_or_default();
                                    show_widget_at(&app, 400.0, 300.0, "shortcut", text);
                                });
                            }
                        })
                        .build(),
                );
                let _ = app.global_shortcut().register(shortcut);
            }

            // Setup System Tray
            let show_item = MenuItem::with_id(app, "show", "Open Settings", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Glyphi", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let tray_icon = app
                .default_window_icon()
                .cloned()
                .unwrap_or_else(|| {
                    let icon_bytes = include_bytes!("../icons/32x32.png");
                    let img = image::load_from_memory(icon_bytes).unwrap().to_rgba8();
                    let (w, h) = img.dimensions();
                    tauri::image::Image::new_owned(img.into_raw(), w, h)
                });

            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            test_api_connection,
            process_text,
            apply_replacement,
            copy_to_clipboard,
            grab_selected_text,
            hide_floating_widget,
            resize_floating_widget,
            minimize_to_tray,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Glyphi application");
}
