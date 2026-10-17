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

pub fn simulate_copy() -> Result<String, String> {
    // Attempt to copy current selection to clipboard
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Enigo init error: {:?}", e))?;

    #[cfg(target_os = "macos")]
    {
        let _ = enigo.key(Key::Meta, Direction::Press);
        thread::sleep(Duration::from_millis(25));
        let _ = enigo.key(Key::C, Direction::Click);
        thread::sleep(Duration::from_millis(25));
        let _ = enigo.key(Key::Meta, Direction::Release);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = enigo.key(Key::Control, Direction::Press);
        thread::sleep(Duration::from_millis(25));
        let _ = enigo.key(Key::C, Direction::Click);
        thread::sleep(Duration::from_millis(25));
        let _ = enigo.key(Key::Control, Direction::Release);
    }

    // Wait a brief moment for OS clipboard buffer to settle
    thread::sleep(Duration::from_millis(100));

    get_clipboard_text()
}

pub fn simulate_paste(text: &str) -> Result<(), String> {
    // Put replacement text into clipboard
    set_clipboard_text(text)?;

    // Short sleep before simulating paste
    thread::sleep(Duration::from_millis(80));

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Enigo init error: {:?}", e))?;

    #[cfg(target_os = "macos")]
    {
        let _ = enigo.key(Key::Meta, Direction::Press);
        thread::sleep(Duration::from_millis(25));
        let _ = enigo.key(Key::V, Direction::Click);
        thread::sleep(Duration::from_millis(25));
        let _ = enigo.key(Key::Meta, Direction::Release);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = enigo.key(Key::Control, Direction::Press);
        thread::sleep(Duration::from_millis(25));
        let _ = enigo.key(Key::V, Direction::Click);
        thread::sleep(Duration::from_millis(25));
        let _ = enigo.key(Key::Control, Direction::Release);
    }

    Ok(())
}
