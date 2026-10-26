use crate::clipboard::{
    is_screenshot_tool_active, is_terminal_window_active, remember_foreground_app,
};
use crate::models::{AppSettings, TriggerEventPayload};
use rdev::{listen, Button, Event, EventType, Key};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size};

static LAST_WIDGET_SHOW: Mutex<Option<Instant>> = Mutex::new(None);

/// Bit flag for each modifier key (Win/Cmd/Super, Ctrl, Alt/Option, Shift) across
/// Windows, macOS and Linux. Bitmask is robust against key auto-repeat.
fn modifier_bit(key: Key) -> u8 {
    match key {
        Key::MetaLeft => 1 << 0,
        Key::MetaRight => 1 << 1,
        Key::ControlLeft => 1 << 2,
        Key::ControlRight => 1 << 3,
        Key::Alt => 1 << 4,
        Key::AltGr => 1 << 5,
        Key::ShiftLeft => 1 << 6,
        Key::ShiftRight => 1 << 7,
        _ => 0,
    }
}

/// Shift alone is normal typing (capital letters), so only these count as "shortcut" modifiers.
const SHORTCUT_MODIFIERS: u8 = 0b0011_1111;

pub struct ListenerState {
    pub enabled: AtomicBool,
    pub settings: Arc<Mutex<AppSettings>>,
}

pub fn start_global_listener(app: AppHandle, settings: Arc<Mutex<AppSettings>>) {
    let state = Arc::new(ListenerState {
        enabled: AtomicBool::new(true),
        settings: settings.clone(),
    });

    let mouse_pos = Arc::new(Mutex::new((0.0f64, 0.0f64)));
    let mouse_down_pos = Arc::new(Mutex::new((0.0f64, 0.0f64)));
    let last_click_time = Arc::new(Mutex::new(None::<Instant>));
    let last_click_pos = Arc::new(Mutex::new((0.0f64, 0.0f64)));
    let last_typing_time = Arc::new(Mutex::new(None::<Instant>));
    let pause_triggered = Arc::new(AtomicBool::new(false));

    // Spawn typing pause monitor thread
    {
        let app = app.clone();
        let state = state.clone();
        let mouse_pos = mouse_pos.clone();
        let last_typing_time = last_typing_time.clone();
        let pause_triggered = pause_triggered.clone();

        thread::spawn(move || loop {
            thread::sleep(Duration::from_millis(200));

            if !state.enabled.load(Ordering::Relaxed) {
                continue;
            }

            let (auto_pause, pause_ms) = {
                let s = state.settings.lock().unwrap();
                (s.auto_trigger_pause, s.pause_delay_ms)
            };

            if !auto_pause {
                continue;
            }

            let should_trigger = {
                let typing_opt = last_typing_time.lock().unwrap();
                if let Some(t) = *typing_opt {
                    if t.elapsed() >= Duration::from_millis(pause_ms)
                        && !pause_triggered.load(Ordering::Relaxed)
                    {
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            };

            if should_trigger {
                if is_terminal_window_active() || is_screenshot_tool_active() {
                    continue;
                }
                pause_triggered.store(true, Ordering::Relaxed);
                let (x, y) = *mouse_pos.lock().unwrap();
                show_widget_at(&app, x, y, "pause", String::new());
            }
        });
    }

    // Spawn rdev event listener thread
    let held_modifiers = Arc::new(std::sync::atomic::AtomicU8::new(0));
    thread::spawn(move || {
        let callback = move |event: Event| {
            if !state.enabled.load(Ordering::Relaxed) {
                return;
            }

            match event.event_type {
                EventType::MouseMove { x, y } => {
                    let mut pos = mouse_pos.lock().unwrap();
                    *pos = (x, y);
                }
                EventType::ButtonPress(button) => {
                    if button == Button::Left {
                        let (x, y) = *mouse_pos.lock().unwrap();
                        let mut down = mouse_down_pos.lock().unwrap();
                        *down = (x, y);
                    }

                    if button == Button::Left || button == Button::Right {
                        let (cur_x, cur_y) = *mouse_pos.lock().unwrap();
                        let px = cur_x as i32;
                        let py = cur_y as i32;

                        if let Some(win) = app.get_webview_window("floating") {
                            if win.is_visible().unwrap_or(false) {
                                let recently_shown = {
                                    let show_lock = LAST_WIDGET_SHOW.lock().unwrap();
                                    if let Some(t) = *show_lock {
                                        t.elapsed() < Duration::from_millis(250)
                                    } else {
                                        false
                                    }
                                };

                                if !recently_shown {
                                    if let (Ok(win_pos), Ok(win_size)) = (win.outer_position(), win.outer_size()) {
                                        let wx = win_pos.x;
                                        let wy = win_pos.y;
                                        let ww = win_size.width as i32;
                                        let wh = win_size.height as i32;

                                        // Allow 8px around, and up to 260px below for OS select popups
                                        let is_inside = px >= wx - 8
                                            && px <= wx + ww + 8
                                            && py >= wy - 8
                                            && py <= wy + wh + 260;

                                        if !is_inside {
                                            let _ = win.hide();
                                            let _ = app.emit("dismiss-floating", ());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                EventType::ButtonRelease(Button::Left) => {
                    let auto_selection = {
                        state.settings.lock().unwrap().auto_trigger_selection
                    };

                    if !auto_selection {
                        return;
                    }

                    let (cur_x, cur_y) = *mouse_pos.lock().unwrap();
                    let (down_x, down_y) = *mouse_down_pos.lock().unwrap();
                    let dx = cur_x - down_x;
                    let dy = cur_y - down_y;
                    let distance_sq = dx * dx + dy * dy;

                    let now = Instant::now();
                    let is_double_click = {
                        let last_time = *last_click_time.lock().unwrap();
                        let (lx, ly) = *last_click_pos.lock().unwrap();
                        let dist_to_prev = (cur_x - lx).powi(2) + (cur_y - ly).powi(2);
                        if let Some(t) = last_time {
                            t.elapsed() < Duration::from_millis(450) && dist_to_prev < 49.0
                        } else {
                            false
                        }
                    };
                    *last_click_time.lock().unwrap() = Some(now);
                    *last_click_pos.lock().unwrap() = (cur_x, cur_y);

                    let is_drag_selection = distance_sq > 25.0;

                    if is_drag_selection || is_double_click {
                        // Check if cursor is inside our own floating window; if so, ignore
                        if let Some(win) = app.get_webview_window("floating") {
                            if win.is_visible().unwrap_or(false) {
                                if let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) {
                                    if cur_x >= pos.x as f64
                                        && cur_x <= (pos.x + size.width as i32) as f64
                                        && cur_y >= pos.y as f64
                                        && cur_y <= (pos.y + size.height as i32) as f64
                                    {
                                        return;
                                    }
                                }
                            }
                        }

                        let app_clone = app.clone();
                        thread::spawn(move || {
                            // Never pop up over screenshot / snipping overlays
                            if is_screenshot_tool_active() {
                                return;
                            }
                            // Only SHOW the widget. No keys are sent and the clipboard is untouched;
                            // the selection is copied only when the user clicks an action button.
                            show_widget_at(&app_clone, cur_x, cur_y, "selection", String::new());
                        });
                    }
                }
                EventType::KeyPress(key) => {
                    let bit = modifier_bit(key);
                    if bit != 0 {
                        // Track held modifiers; never count them as "typing"
                        held_modifiers.fetch_or(bit, Ordering::Relaxed);
                        return;
                    }
                    if held_modifiers.load(Ordering::Relaxed) & SHORTCUT_MODIFIERS != 0 {
                        // Keyboard shortcut (e.g. Win+Shift+S, Cmd+Shift+4, Ctrl+C):
                        // cancel any pending pause trigger so we never steal focus
                        // from screenshot overlays or other system UI.
                        *last_typing_time.lock().unwrap() = None;
                        return;
                    }
                    let mut t = last_typing_time.lock().unwrap();
                    *t = Some(Instant::now());
                    pause_triggered.store(false, Ordering::Relaxed);
                }
                EventType::KeyRelease(key) => {
                    let bit = modifier_bit(key);
                    if bit != 0 {
                        held_modifiers.fetch_and(!bit, Ordering::Relaxed);
                    }
                }
                _ => {}
            }
        };

        if let Err(err) = listen(callback) {
            eprintln!("rdev listener error: {:?}", err);
        }
    });
}

pub fn show_widget_at(app: &AppHandle, x: f64, y: f64, trigger_type: &str, text: String) {
    // Remember which app the user was in, so the action buttons can copy from it later
    remember_foreground_app();
    if let Some(window) = app.get_webview_window("floating") {
        // Query monitor geometry for screen boundary clamping
        let (monitor_x, monitor_y, monitor_w, monitor_h, scale_factor) =
            if let Ok(Some(monitor)) = window.current_monitor() {
                let pos = monitor.position();
                let size = monitor.size();
                (
                    pos.x,
                    pos.y,
                    size.width as i32,
                    size.height as i32,
                    monitor.scale_factor(),
                )
            } else {
                (0, 0, 1920, 1080, 1.0)
            };

        let logical_w = 44.0;
        let logical_h = 44.0;
        let physical_w = (logical_w * scale_factor) as i32;
        let physical_h = (logical_h * scale_factor) as i32;
        let margin = (16.0 * scale_factor) as i32;

        let cur_x = x as i32;
        let cur_y = y as i32;

        // Default position: slightly below and right of cursor
        let mut target_x = cur_x + (12.0 * scale_factor) as i32;
        let mut target_y = cur_y + (16.0 * scale_factor) as i32;

        let monitor_right = monitor_x + monitor_w;
        let monitor_bottom = monitor_y + monitor_h;

        // Prevent crossing right edge: account for full expanded pill width (340.0) so hover stays on-screen
        let expanded_physical_w = (340.0 * scale_factor) as i32;
        if target_x + expanded_physical_w > monitor_right - margin {
            target_x = cur_x - physical_w - (8.0 * scale_factor) as i32;
            if target_x + expanded_physical_w > monitor_right - margin {
                target_x = monitor_right - expanded_physical_w - margin;
            }
        }

        // Prevent crossing bottom edge: flip above cursor or clamp
        if target_y + physical_h > monitor_bottom - margin {
            target_y = cur_y - physical_h - (12.0 * scale_factor) as i32;
            if target_y < monitor_y + margin {
                target_y = monitor_bottom - physical_h - margin;
            }
        }

        // Final boundary clamp
        target_x = target_x.max(monitor_x + margin).min(monitor_right - physical_w - margin);
        target_y = target_y.max(monitor_y + margin).min(monitor_bottom - physical_h - margin);

        let _ = window.set_size(Size::Logical(LogicalSize {
            width: logical_w,
            height: logical_h,
        }));

        let _ = window.set_position(Position::Physical(PhysicalPosition {
            x: target_x,
            y: target_y,
        }));

        let _ = window.emit(
            "trigger-pill",
            TriggerEventPayload {
                text,
                x,
                y,
                trigger_type: trigger_type.to_string(),
            },
        );

        let _ = window.show();
        *LAST_WIDGET_SHOW.lock().unwrap() = Some(Instant::now());
    }
}
