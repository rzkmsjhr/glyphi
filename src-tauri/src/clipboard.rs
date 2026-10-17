use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

static CLIPBOARD_LOCK: Mutex<()> = Mutex::new(());

pub fn get_clipboard_text() -> Result<String, String> {
    let _guard = CLIPBOARD_LOCK.lock().map_err(|e| e.to_string())?;
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard error: {}", e))?;
    clipboard.get_text().map_err(|e| format!("Clipboard get text error: {}", e))
}

pub fn set_clipboard_text(text: &str) -> Result<(), String> {
    let _guard = CLIPBOARD_LOCK.lock().map_err(|e| e.to_string())?;
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard error: {}", e))?;
    clipboard.set_text(text.to_string()).map_err(|e| format!("Clipboard set text error: {}", e))
}

#[cfg(target_os = "windows")]
const KEY_COPY: Key = Key::C;
#[cfg(target_os = "windows")]
const KEY_PASTE: Key = Key::V;

#[cfg(not(target_os = "windows"))]
const KEY_COPY: Key = Key::Unicode('c');
#[cfg(not(target_os = "windows"))]
const KEY_PASTE: Key = Key::Unicode('v');

pub fn simulate_copy() -> Result<String, String> {
    // Attempt to copy current selection to clipboard
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Enigo init error: {:?}", e))?;

    #[cfg(target_os = "macos")]
    let modifier = Key::Meta;
    #[cfg(not(target_os = "macos"))]
    let modifier = Key::Control;

    let _ = enigo.key(modifier, Direction::Press);
    thread::sleep(Duration::from_millis(15));
    let _ = enigo.key(KEY_COPY, Direction::Click);
    thread::sleep(Duration::from_millis(15));
    let _ = enigo.key(modifier, Direction::Release);

    // Wait a brief moment for OS clipboard buffer to settle
    thread::sleep(Duration::from_millis(40));

    get_clipboard_text()
}

pub fn simulate_paste(text: &str) -> Result<(), String> {
    // Put replacement text into clipboard
    set_clipboard_text(text)?;

    // Short sleep before simulating paste
    thread::sleep(Duration::from_millis(30));

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Enigo init error: {:?}", e))?;

    #[cfg(target_os = "macos")]
    let modifier = Key::Meta;
    #[cfg(not(target_os = "macos"))]
    let modifier = Key::Control;

    let _ = enigo.key(modifier, Direction::Press);
    thread::sleep(Duration::from_millis(15));
    let _ = enigo.key(KEY_PASTE, Direction::Click);
    thread::sleep(Duration::from_millis(15));
    let _ = enigo.key(modifier, Direction::Release);

    Ok(())
}
