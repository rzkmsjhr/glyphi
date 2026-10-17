# Glyphi

Glyphi is a system-wide AI writing, grammar check, and translation assistant built with Tauri v2, Rust, React, and TypeScript.

Unlike browser extensions that only work in web pages, Glyphi operates across your entire operating system: Word, Slack, VS Code, Discord, terminal, browsers, and notes.

---

## Key Features

1. **Dual Trigger Conditions**:
   - **Text Selection**: Automatically displays a floating action pill when you highlight text in any application.
   - **Typing Pause**: Surfaces an unobtrusive indicator when you stop typing for a configurable duration (default: 1.5s).
   - **Global Hotkey**: Press `Alt+G` (or `Option+G` on macOS) to instantly capture the active selection and open Glyphi.
2. **Preview-First Workflow**:
   - Never alters text without confirmation.
   - Displays side-by-side comparisons with clear green addition and red deletion diff highlights.
   - You choose: click **Apply** to replace the text in place, **Copy All** to your clipboard, or hit `Esc` to dismiss.
3. **Multi-Model LLM Support**:
   - **Google Gemini**: Supports `gemini-2.0-flash`, `gemini-1.5-flash`, and `gemini-1.5-pro`.
   - **OpenAI ChatGPT**: Supports `gpt-4o-mini` and `gpt-4o`.
   - Secure direct requests from the Rust backend.
4. **Customizable Prompts & Languages**:
   - Translate to any language (English, Spanish, Indonesian, Japanese, French, German, Mandarin, and more).
   - Edit custom system prompts for grammar correction, translation, and tone polish.
5. **Interactive Sandbox**:
   - Test your API key and prompts inside the settings panel before using them system-wide.

---

## Architecture

- **Backend (Rust & Tauri v2)**:
  - `src-tauri/src/ai.rs`: Gemini and OpenAI API client with word-level diff calculation.
  - `src-tauri/src/listener.rs`: Cross-platform mouse selection and typing pause listener via `rdev`.
  - `src-tauri/src/clipboard.rs`: Clipboard read/write and simulated paste via `arboard` and `enigo`.
  - `src-tauri/src/config.rs`: Persistent JSON settings stored in the user app data directory.
- **Frontend (React 19 & TypeScript)**:
  - `src/components/FloatingWidget.tsx`: Compact floating pill and expandable diff comparison card.
  - `src/components/SettingsDashboard.tsx`: Comprehensive configuration panel with live sandbox.

---

## Platform Support

- **Windows**: Full support out of the box with standard user privileges.
- **macOS**: Requires Accessibility permission in **System Settings → Privacy & Security → Accessibility** to permit global mouse-up detection and text pasting.
- **Linux**:
  - **X11**: Full native support via `XA_PRIMARY` and global hooks.
  - **Wayland**: Supported via AT-SPI or universal global hotkey (`Alt+G`).

---

## Development

Run development server:
```bash
npm run tauri dev
```

Build production executable:
```bash
npm run tauri build
```
