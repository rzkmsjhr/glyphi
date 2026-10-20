use arboard::{Clipboard, ImageData};
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::borrow::Cow;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

static CLIPBOARD_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug)]
pub enum ClipboardBackup {
    Text(String),
    Image {
        width: usize,
        height: usize,
        bytes: Vec<u8>,
    },
    Empty,
}

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

pub fn has_clipboard_image() -> bool {
    let _guard = match CLIPBOARD_LOCK.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    if let Ok(mut clipboard) = Clipboard::new() {
        clipboard.get_image().is_ok()
    } else {
        false
    }
}

pub fn backup_clipboard() -> Result<ClipboardBackup, String> {
    let _guard = CLIPBOARD_LOCK.lock().map_err(|e| e.to_string())?;
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard error: {}", e))?;

    // Check for image first to preserve screenshots and copied graphics
    if let Ok(img) = clipboard.get_image() {
        return Ok(ClipboardBackup::Image {
            width: img.width,
            height: img.height,
            bytes: img.bytes.into_owned(),
        });
    }

    // Check for text
    if let Ok(text) = clipboard.get_text() {
        if !text.is_empty() {
            return Ok(ClipboardBackup::Text(text));
        }
    }

    Ok(ClipboardBackup::Empty)
}

pub fn restore_clipboard(backup: ClipboardBackup) -> Result<(), String> {
    let _guard = CLIPBOARD_LOCK.lock().map_err(|e| e.to_string())?;
    let mut clipboard = Clipboard::new().map_err(|e| format!("Clipboard error: {}", e))?;
    match backup {
        ClipboardBackup::Text(t) => {
            let _ = clipboard.set_text(t);
        }
        ClipboardBackup::Image { width, height, bytes } => {
            let img = ImageData {
                width,
                height,
                bytes: Cow::Owned(bytes),
            };
            let _ = clipboard.set_image(img);
        }
        ClipboardBackup::Empty => {
            let _ = clipboard.clear();
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn get_clipboard_sequence() -> u64 {
    unsafe {
        #[link(name = "user32")]
        unsafe extern "system" {
            fn GetClipboardSequenceNumber() -> u32;
        }
        GetClipboardSequenceNumber() as u64
    }
}

#[cfg(target_os = "macos")]
pub fn get_clipboard_sequence() -> u64 {
    use std::ffi::{c_char, c_void};
    unsafe {
        #[link(name = "objc")]
        unsafe extern "C" {
            fn objc_getClass(name: *const c_char) -> *mut c_void;
            fn sel_registerName(name: *const c_char) -> *mut c_void;
            fn objc_msgSend(receiver: *mut c_void, op: *mut c_void, ...) -> *mut c_void;
        }

        let cls = objc_getClass(b"NSPasteboard\0".as_ptr() as *const c_char);
        if cls.is_null() {
            return 0;
        }
        let sel_general = sel_registerName(b"generalPasteboard\0".as_ptr() as *const c_char);
        let pb = objc_msgSend(cls, sel_general);
        if pb.is_null() {
            return 0;
        }
        let sel_count = sel_registerName(b"changeCount\0".as_ptr() as *const c_char);
        let count_fn: unsafe extern "C" fn(*mut c_void, *mut c_void) -> isize =
            std::mem::transmute(objc_msgSend as *const ());
        let count = count_fn(pb, sel_count);
        count as u64
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn get_clipboard_sequence() -> u64 {
    0
}

#[cfg(target_os = "windows")]
pub fn is_screenshot_tool_active() -> bool {
    use std::ffi::c_void;
    unsafe {
        #[link(name = "user32")]
        unsafe extern "system" {
            fn GetForegroundWindow() -> *mut c_void;
            fn GetClassNameW(hwnd: *mut c_void, lpClassName: *mut u16, nMaxCount: i32) -> i32;
            fn GetWindowThreadProcessId(hwnd: *mut c_void, lpdwProcessId: *mut u32) -> u32;
        }
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> *mut c_void;
            fn CloseHandle(hObject: *mut c_void) -> i32;
            fn QueryFullProcessImageNameW(hProcess: *mut c_void, dwFlags: u32, lpExeName: *mut u16, lpdwSize: *mut u32) -> i32;
        }

        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return false;
        }

        // Fast check: window class name
        let mut class_buf = [0u16; 256];
        let class_len = GetClassNameW(hwnd, class_buf.as_mut_ptr(), 256);
        if class_len > 0 {
            let class_str = String::from_utf16_lossy(&class_buf[..class_len as usize]).to_lowercase();
            if class_str.contains("screenclippinghost")
                || class_str.contains("snippingtool")
                || class_str.contains("snipper")
            {
                return true;
            }
        }

        // Check process executable name
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid != 0 {
            // PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            let h_proc = OpenProcess(0x1000, 0, pid);
            if !h_proc.is_null() {
                let mut path_buf = [0u16; 1024];
                let mut size: u32 = 1024;
                if QueryFullProcessImageNameW(h_proc, 0, path_buf.as_mut_ptr(), &mut size) != 0 {
                    let exe_path = String::from_utf16_lossy(&path_buf[..size as usize]).to_lowercase();
                    CloseHandle(h_proc);
                    if exe_path.ends_with("screenclippinghost.exe")
                        || exe_path.ends_with("snippingtool.exe")
                        || exe_path.ends_with("snippingtoolapp.exe")
                        || exe_path.ends_with("lightshot.exe")
                        || exe_path.ends_with("greenshot.exe")
                        || exe_path.ends_with("sharex.exe")
                    {
                        return true;
                    }
                } else {
                    CloseHandle(h_proc);
                }
            }
        }

        false
    }
}

#[cfg(not(target_os = "windows"))]
pub fn is_screenshot_tool_active() -> bool {
    false
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

#[cfg(test)]
mod tests {
    use super::*;
    static TEST_MUTEX: Mutex<()> = Mutex::new(());

    #[test]
    fn test_clipboard_text_roundtrip() {
        let _test_guard = TEST_MUTEX.lock().unwrap();
        let test_str = "glyphi_test_clipboard_content_12345";
        let prev = backup_clipboard().unwrap_or(ClipboardBackup::Empty);
        let _ = set_clipboard_text(test_str);
        let read = get_clipboard_text().unwrap_or_default();
        assert_eq!(read, test_str);
        let _ = restore_clipboard(prev);
    }

    #[test]
    fn test_clipboard_image_backup_restore() {
        let _test_guard = TEST_MUTEX.lock().unwrap();
        // Create 2x2 RGBA image
        let img_bytes = vec![
            255, 0, 0, 255,    // Red
            0, 255, 0, 255,    // Green
            0, 0, 255, 255,    // Blue
            255, 255, 255, 255 // White
        ];
        let original_backup = backup_clipboard().unwrap_or(ClipboardBackup::Empty);

        let img = ImageData {
            width: 2,
            height: 2,
            bytes: Cow::Borrowed(&img_bytes),
        };
        let mut clipboard = Clipboard::new().expect("init clipboard");
        let _ = clipboard.set_image(img);

        assert!(has_clipboard_image(), "Clipboard should indicate image presence");

        let backup = backup_clipboard().expect("backup image");
        match backup {
            ClipboardBackup::Image { width, height, bytes } => {
                assert_eq!(width, 2);
                assert_eq!(height, 2);
                assert_eq!(bytes.len(), 16);
            }
            _ => panic!("Expected image backup"),
        }

        // Restore original clipboard
        let _ = restore_clipboard(original_backup);
    }
}
