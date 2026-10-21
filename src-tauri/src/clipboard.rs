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

pub fn is_terminal_class_name(class_name: &str) -> bool {
    let c = class_name.to_ascii_lowercase();
    c == "cascadia_hosting_window_class"
        || c == "consolewindowclass"
        || c == "mintty"
        || c == "virtualconsoleclass"
        || c.contains("putty")
        || c.contains("kitty")
        || c.contains("alacritty")
        || c.contains("wezterm")
        || c.contains("ghostty")
        || c.contains("terminal")
}

pub fn is_terminal_exe_name(path: &str) -> bool {
    let filename = std::path::Path::new(path)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or(path);

    const TERMINAL_EXES: &[&str] = &[
        "windowsterminal.exe",
        "wt.exe",
        "cmd.exe",
        "powershell.exe",
        "pwsh.exe",
        "conhost.exe",
        "mintty.exe",
        "bash.exe",
        "zsh.exe",
        "wsl.exe",
        "wslhost.exe",
        "alacritty.exe",
        "wezterm-gui.exe",
        "wezterm.exe",
        "kitty.exe",
        "hyper.exe",
        "tabby.exe",
        "warp.exe",
        "ghostty.exe",
        "putty.exe",
        "kitty_portable.exe",
        "mobaxterm.exe",
        "termius.exe",
        "cmder.exe",
        "conemu.exe",
        "conemu64.exe",
        "git-bash.exe",
        "xshell.exe",
        "securecrt.exe",
        "fluentterminal.exe",
        "terminus.exe",
    ];

    TERMINAL_EXES.iter().any(|&t| filename.eq_ignore_ascii_case(t))
}

pub fn is_screenshot_class_name(class_name: &str) -> bool {
    let c = class_name.to_ascii_lowercase();
    c.contains("screenclippinghost") || c.contains("snippingtool") || c.contains("snipper")
}

pub fn is_screenshot_exe_name(path: &str) -> bool {
    let filename = std::path::Path::new(path)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or(path);

    const SCREENSHOT_EXES: &[&str] = &[
        "screenclippinghost.exe",
        "snippingtool.exe",
        "snippingtoolapp.exe",
        "lightshot.exe",
        "greenshot.exe",
        "sharex.exe",
        "flameshot.exe",
    ];

    SCREENSHOT_EXES.iter().any(|&s| filename.eq_ignore_ascii_case(s))
}

#[cfg(target_os = "windows")]
pub struct ForegroundWindowInfo {
    pub class_name: String,
    pub process_path: String,
}

#[cfg(target_os = "windows")]
pub fn get_foreground_window_info() -> Option<ForegroundWindowInfo> {
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
            return None;
        }

        let mut class_buf = [0u16; 256];
        let class_len = GetClassNameW(hwnd, class_buf.as_mut_ptr(), 256);
        let class_name = if class_len > 0 {
            String::from_utf16_lossy(&class_buf[..class_len as usize])
        } else {
            String::new()
        };

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let mut process_path = String::new();
        if pid != 0 {
            let h_proc = OpenProcess(0x1000, 0, pid);
            if !h_proc.is_null() {
                let mut path_buf = [0u16; 1024];
                let mut size: u32 = 1024;
                if QueryFullProcessImageNameW(h_proc, 0, path_buf.as_mut_ptr(), &mut size) != 0 {
                    process_path = String::from_utf16_lossy(&path_buf[..size as usize]);
                }
                CloseHandle(h_proc);
            }
        }

        Some(ForegroundWindowInfo {
            class_name,
            process_path,
        })
    }
}

#[cfg(target_os = "windows")]
pub fn is_screenshot_tool_active() -> bool {
    if let Some(info) = get_foreground_window_info() {
        if is_screenshot_class_name(&info.class_name) || is_screenshot_exe_name(&info.process_path) {
            return true;
        }
    }
    false
}

#[cfg(target_os = "windows")]
pub fn is_terminal_window_active() -> bool {
    if let Some(info) = get_foreground_window_info() {
        if is_terminal_class_name(&info.class_name) || is_terminal_exe_name(&info.process_path) {
            return true;
        }
    }
    false
}

#[cfg(target_os = "macos")]
fn get_macos_frontmost_app_info() -> Option<(String, String)> {
    use std::ffi::{c_char, c_void, CStr};
    unsafe {
        #[link(name = "objc")]
        unsafe extern "C" {
            fn objc_getClass(name: *const c_char) -> *mut c_void;
            fn sel_registerName(name: *const c_char) -> *mut c_void;
            fn objc_msgSend(receiver: *mut c_void, op: *mut c_void, ...) -> *mut c_void;
        }

        let cls_ws = objc_getClass(b"NSWorkspace\0".as_ptr() as *const c_char);
        if cls_ws.is_null() {
            return None;
        }
        let sel_shared = sel_registerName(b"sharedWorkspace\0".as_ptr() as *const c_char);
        let ws = objc_msgSend(cls_ws, sel_shared);
        if ws.is_null() {
            return None;
        }
        let sel_front = sel_registerName(b"frontmostApplication\0".as_ptr() as *const c_char);
        let app = objc_msgSend(ws, sel_front);
        if app.is_null() {
            return None;
        }

        let sel_utf8 = sel_registerName(b"UTF8String\0".as_ptr() as *const c_char);
        let utf8_fn: unsafe extern "C" fn(*mut c_void, *mut c_void) -> *const c_char =
            std::mem::transmute(objc_msgSend as *const ());

        let sel_bundle = sel_registerName(b"bundleIdentifier\0".as_ptr() as *const c_char);
        let bundle_id_obj = objc_msgSend(app, sel_bundle);
        let bundle_id = if !bundle_id_obj.is_null() {
            let ptr = utf8_fn(bundle_id_obj, sel_utf8);
            if !ptr.is_null() {
                CStr::from_ptr(ptr).to_string_lossy().to_string()
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let sel_name = sel_registerName(b"localizedName\0".as_ptr() as *const c_char);
        let name_obj = objc_msgSend(app, sel_name);
        let localized_name = if !name_obj.is_null() {
            let ptr = utf8_fn(name_obj, sel_utf8);
            if !ptr.is_null() {
                CStr::from_ptr(ptr).to_string_lossy().to_string()
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        Some((bundle_id, localized_name))
    }
}

#[cfg(target_os = "macos")]
pub fn is_screenshot_tool_active() -> bool {
    if let Some((bundle_id, name)) = get_macos_frontmost_app_info() {
        let b = bundle_id.to_lowercase();
        let n = name.to_lowercase();
        b.contains("screencapture")
            || b.contains("snip")
            || b.contains("shottr")
            || b.contains("cleanshot")
            || n.contains("screenshot")
            || n.contains("screencapture")
    } else {
        false
    }
}

#[cfg(target_os = "macos")]
pub fn is_terminal_window_active() -> bool {
    if let Some((bundle_id, name)) = get_macos_frontmost_app_info() {
        let b = bundle_id.to_lowercase();
        let n = name.to_lowercase();
        b.contains("terminal")
            || b.contains("iterm")
            || b.contains("kitty")
            || b.contains("alacritty")
            || b.contains("hyper")
            || b.contains("tabby")
            || b.contains("warp")
            || b.contains("ghostty")
            || b.contains("wezterm")
            || n == "terminal"
            || n == "iterm2"
            || n == "kitty"
            || n == "alacritty"
            || n == "ghostty"
            || n == "wezterm"
    } else {
        false
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn is_screenshot_tool_active() -> bool {
    false
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn is_terminal_window_active() -> bool {
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

    #[test]
    fn test_is_terminal_class_and_exe() {
        assert!(is_terminal_class_name("CASCADIA_HOSTING_WINDOW_CLASS"));
        assert!(is_terminal_class_name("ConsoleWindowClass"));
        assert!(is_terminal_class_name("mintty"));
        assert!(is_terminal_class_name("VirtualConsoleClass"));
        assert!(is_terminal_class_name("PuTTY"));
        assert!(is_terminal_class_name("Alacritty"));
        assert!(is_terminal_class_name("org.wezfurlong.wezterm"));
        assert!(!is_terminal_class_name("Chrome_WidgetWin_1"));
        assert!(!is_terminal_class_name("Notepad"));

        assert!(is_terminal_exe_name(r"C:\Program Files\WindowsApps\Microsoft.WindowsTerminal_8wekyb3d8bbwe\WindowsTerminal.exe"));
        assert!(is_terminal_exe_name(r"C:\Windows\System32\cmd.exe"));
        assert!(is_terminal_exe_name(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"));
        assert!(is_terminal_exe_name(r"C:\Program Files\PowerShell\7\pwsh.exe"));
        assert!(is_terminal_exe_name(r"C:\Program Files\Git\usr\bin\mintty.exe"));
        assert!(is_terminal_exe_name(r"C:\Users\User\AppData\Local\Programs\hyper\Hyper.exe"));
        assert!(is_terminal_exe_name(r"C:\Users\User\AppData\Local\Programs\Alacritty\alacritty.exe"));
        assert!(is_terminal_exe_name(r"C:\Program Files\WezTerm\wezterm-gui.exe"));
        assert!(is_terminal_exe_name(r"C:\Program Files\Warp\warp.exe"));
        assert!(!is_terminal_exe_name(r"C:\Program Files\Google\Chrome\Application\chrome.exe"));
        assert!(!is_terminal_exe_name(r"C:\Windows\System32\notepad.exe"));
        assert!(!is_terminal_exe_name(r"C:\Users\User\AppData\Local\Programs\Microsoft VS Code\Code.exe"));
    }

    #[test]
    fn test_is_screenshot_class_and_exe() {
        assert!(is_screenshot_class_name("ScreenClippingHost"));
        assert!(is_screenshot_class_name("SnippingTool"));
        assert!(!is_screenshot_class_name("Notepad"));

        assert!(is_screenshot_exe_name(r"C:\Windows\System32\SnippingTool.exe"));
        assert!(is_screenshot_exe_name(r"C:\Program Files\Lightshot\Lightshot.exe"));
        assert!(is_screenshot_exe_name(r"C:\Program Files\ShareX\ShareX.exe"));
        assert!(!is_screenshot_exe_name(r"C:\Windows\System32\notepad.exe"));
    }
}
