import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { AppSettings, DEFAULT_SETTINGS, ProcessTextResponse } from "../types";
import { TARGET_LANGUAGES, getRomajiLabel } from "./FloatingWidget";

const getSafeLocalTheme = (): "dark" | "light" => {
  try {
    const t = localStorage.getItem("glyphi-theme");
    return t === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
};

const setSafeLocalTheme = (theme: "dark" | "light") => {
  try {
    localStorage.setItem("glyphi-theme", theme);
  } catch {
    // ignore
  }
};

const normalizeSettings = (data?: Partial<AppSettings> | null): AppSettings => {
  const s: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(data || {}),
  };
  if (
    !s.gemini_model ||
    s.gemini_model === "gemini-3.8-flash" ||
    s.gemini_model === "gemini-2.0-flash" ||
    s.gemini_model === "gemini-2.5-flash" ||
    s.gemini_model === "gemini-1.5-flash"
  ) {
    s.gemini_model = "gemini-3.5-flash-lite";
  }
  if (!s.theme) {
    s.theme = getSafeLocalTheme();
  }
  return s;
};

export const SettingsDashboard: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  // Interactive Sandbox states
  const [sandboxText, setSandboxText] = useState(
    "he dont know how to spoke english good and he want to translate this"
  );
  const [sandboxRunning, setSandboxRunning] = useState(false);
  const [sandboxResponse, setSandboxResponse] = useState<ProcessTextResponse | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  // Listen for native OS window close button clicks intercepted by the Rust event loop
  useEffect(() => {
    const unlistenPromise = listen("open-close-modal", () => {
      setShowCloseModal(true);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Support Escape key to dismiss the close modal
  useEffect(() => {
    if (!showCloseModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowCloseModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCloseModal]);

  const handleMinimizeToTray = async () => {
    try {
      setShowCloseModal(false);
      await invoke("minimize_to_tray");
    } catch (err) {
      console.error("Failed to minimize to tray:", err);
    }
  };

  const handleExitApp = async () => {
    try {
      await invoke("exit_app");
    } catch (err) {
      console.error("Failed to exit application:", err);
    }
  };

  const loadSettings = async () => {
    setLoadError(null);
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout loading settings from backend")), 3000)
      );
      const data = await Promise.race([
        invoke<AppSettings>("get_settings"),
        timeoutPromise,
      ]);
      const normalized = normalizeSettings(data);
      document.documentElement.setAttribute("data-theme", normalized.theme);
      setSafeLocalTheme(normalized.theme);
      setSettings(normalized);
    } catch (err: any) {
      console.warn("Failed or timed out loading backend settings, using defaults:", err);
      const fallback = normalizeSettings(null);
      document.documentElement.setAttribute("data-theme", fallback.theme);
      setSafeLocalTheme(fallback.theme);
      setSettings(fallback);
      setLoadError(
        typeof err === "string"
          ? err
          : err?.message || "Could not connect to settings storage. Default settings loaded."
      );
    }
  };

  const handleThemeChange = async (newTheme: "dark" | "light") => {
    if (!settings) return;
    const updated = { ...settings, theme: newTheme };
    setSettings(updated);
    document.documentElement.setAttribute("data-theme", newTheme);
    setSafeLocalTheme(newTheme);
    try {
      await emit("theme-changed", newTheme);
      await invoke("save_settings", { settings: updated });
    } catch (err) {
      console.error("Failed to sync theme:", err);
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm("Are you sure you want to reset all preferences to default values?")) {
      return;
    }
    setResetting(true);
    setResetSuccess(false);
    try {
      let defaults: AppSettings;
      try {
        defaults = await invoke<AppSettings>("reset_settings");
      } catch {
        defaults = DEFAULT_SETTINGS;
        await invoke("save_settings", { settings: defaults });
      }
      const normalized = normalizeSettings(defaults);
      setSettings(normalized);
      document.documentElement.setAttribute("data-theme", normalized.theme);
      setSafeLocalTheme(normalized.theme);
      setLoadError(null);
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 2500);
    } catch (err) {
      console.error("Failed to reset settings:", err);
    } finally {
      setResetting(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await invoke("save_settings", { settings });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!settings) return;
    setTestingConnection(true);
    setTestResult(null);

    const apiKey =
      settings.provider === "gemini" ? settings.gemini_api_key.trim() : settings.openai_api_key.trim();
    const model =
      settings.provider === "gemini" ? settings.gemini_model : settings.openai_model;

    try {
      await invoke("test_api_connection", {
        provider: settings.provider,
        apiKey,
        model,
      });
      setTestResult({ ok: true, msg: "Connection successful." });
      // Auto-save verified preferences
      const cleanSettings = {
        ...settings,
        gemini_api_key: settings.gemini_api_key.trim(),
        openai_api_key: settings.openai_api_key.trim(),
      };
      setSettings(cleanSettings);
      await invoke("save_settings", { settings: cleanSettings });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setTestResult({
        ok: false,
        msg: typeof err === "string" ? err : err.message || "Connection failed.",
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRunSandbox = async (action: "grammar" | "translate" | "rewrite") => {
    if (!sandboxText.trim()) return;
    setSandboxRunning(true);
    setSandboxError(null);
    setSandboxResponse(null);

    try {
      // Auto-save current settings so sandbox immediately uses any entered API key / model / provider
      if (settings) {
        const cleanSettings = {
          ...settings,
          gemini_api_key: settings.gemini_api_key.trim(),
          openai_api_key: settings.openai_api_key.trim(),
        };
        await invoke("save_settings", { settings: cleanSettings });
      }

      const res = await invoke<ProcessTextResponse>("process_text", {
        req: {
          action,
          text: sandboxText,
          target_language: settings?.target_language || "English",
          custom_prompt: null,
        },
      });
      setSandboxResponse(res);
    } catch (err: any) {
      setSandboxError(typeof err === "string" ? err : err.message || "Error processing text.");
    } finally {
      setSandboxRunning(false);
    }
  };

  if (!settings) {
    return (
      <div className="dashboard-loading">
        <div className="loading-indicator" />
        <p>Loading Glyphi preferences...</p>
        <button
          className="btn secondary sm"
          style={{ marginTop: 12 }}
          onClick={() => {
            const fallback = normalizeSettings(null);
            document.documentElement.setAttribute("data-theme", fallback.theme);
            setSafeLocalTheme(fallback.theme);
            setSettings(fallback);
          }}
        >
          Use Defaults
        </button>
      </div>
    );
  }

  return (
    <div className="settings-wrapper">
      <header className="settings-header">
        <div className="header-brand">
          <img src="/app-icon.svg" className="brand-badge-img" alt="Glyphi Logo" />
          <div>
            <h1>Glyphi</h1>
            <p className="subtitle">System-wide AI Writing, Grammar, and Translation Assistant</p>
          </div>
        </div>
        <div className="header-actions">
          {saveSuccess && <span className="save-status-badge">Settings saved</span>}
          {resetSuccess && <span className="save-status-badge">Reset to defaults</span>}
          <button
            className="btn secondary"
            onClick={handleResetDefaults}
            disabled={saving || resetting}
            title="Reset all preferences to default values"
          >
            {resetting ? "Resetting..." : "Reset Defaults"}
          </button>
          <button className="btn primary" onClick={handleSave} disabled={saving || resetting}>
            {saving ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </header>

      {loadError && (
        <div className="settings-alert-banner">
          <span>{loadError} Default configuration is active.</span>
          <div className="settings-alert-actions">
            <button className="settings-alert-btn" onClick={loadSettings}>
              Retry
            </button>
            <button
              className="settings-alert-close"
              onClick={() => setLoadError(null)}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="settings-grid">
        {/* Left Column: AI Provider & Live Sandbox */}
        <div className="settings-col">
          <section className="settings-card">
            <h2>AI Provider & Credentials</h2>

            <div className="form-group">
              <label>Service Provider</label>
              <div className="provider-selector">
                <button
                  type="button"
                  className={`provider-btn ${settings.provider === "gemini" ? "active" : ""}`}
                  onClick={() => setSettings({ ...settings, provider: "gemini" })}
                >
                  Google Gemini
                </button>
                <button
                  type="button"
                  className={`provider-btn ${settings.provider === "chatgpt" ? "active" : ""}`}
                  onClick={() => setSettings({ ...settings, provider: "chatgpt" })}
                >
                  OpenAI ChatGPT
                </button>
              </div>
            </div>

            {settings.provider === "gemini" ? (
              <>
                <div className="form-group">
                  <label htmlFor="gemini-key">Gemini API Key</label>
                  <div className="input-with-button">
                    <input
                      id="gemini-key"
                      type={showApiKey ? "text" : "password"}
                      value={settings.gemini_api_key}
                      onChange={(e) =>
                        setSettings({ ...settings, gemini_api_key: e.target.value })
                      }
                      placeholder="AIzaSy..."
                    />
                    <button
                      type="button"
                      className="btn secondary sm"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="gemini-model">Gemini Model</label>
                  <select
                    id="gemini-model"
                    value={settings.gemini_model}
                    onChange={(e) =>
                      setSettings({ ...settings, gemini_model: e.target.value })
                    }
                  >
                    <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Ultra Fast, ~600ms - Recommended)</option>
                    <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra Fast, ~900ms)</option>
                    <option value="gemini-3.5-flash">gemini-3.5-flash (Balanced, ~1.5s)</option>
                    <option value="gemini-3.8-flash">gemini-3.8-flash (Standard, ~3.5s)</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro (High capability)</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="openai-key">OpenAI API Key</label>
                  <div className="input-with-button">
                    <input
                      id="openai-key"
                      type={showApiKey ? "text" : "password"}
                      value={settings.openai_api_key}
                      onChange={(e) =>
                        setSettings({ ...settings, openai_api_key: e.target.value })
                      }
                      placeholder="sk-..."
                    />
                    <button
                      type="button"
                      className="btn secondary sm"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="openai-model">ChatGPT Model</label>
                  <select
                    id="openai-model"
                    value={settings.openai_model}
                    onChange={(e) =>
                      setSettings({ ...settings, openai_model: e.target.value })
                    }
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini (Fast & efficient)</option>
                    <option value="gpt-4o">gpt-4o (High precision)</option>
                  </select>
                </div>
              </>
            )}

            <div className="form-row test-connection-row">
              <button
                type="button"
                className="btn secondary sm"
                onClick={handleTestConnection}
                disabled={testingConnection}
              >
                {testingConnection ? "Testing..." : "Test Connection"}
              </button>
              {testResult && (
                <span className={`test-status ${testResult.ok ? "success" : "error"}`}>
                  {testResult.msg}
                </span>
              )}
            </div>
          </section>

          <section className="settings-card sandbox-card">
            <h2>Live Sandbox</h2>
            <p className="card-desc">
              Test grammar checks and translation live with your configured keys:
            </p>

            <textarea
              className="sandbox-textarea"
              rows={2}
              value={sandboxText}
              onChange={(e) => setSandboxText(e.target.value)}
              placeholder="Type or paste sample text here..."
            />

            <div className="sandbox-actions">
              <button
                type="button"
                className="btn primary sm"
                onClick={() => handleRunSandbox("grammar")}
                disabled={sandboxRunning}
              >
                Check Grammar
              </button>
              <button
                type="button"
                className="btn secondary sm"
                onClick={() => handleRunSandbox("translate")}
                disabled={sandboxRunning}
              >
                Translate
              </button>
              <button
                type="button"
                className="btn secondary sm"
                onClick={() => handleRunSandbox("rewrite")}
                disabled={sandboxRunning}
              >
                Polish Tone
              </button>
            </div>

            {sandboxRunning && (
              <div className="sandbox-status">
                <div className="loading-indicator sm" />
                <span>Running request...</span>
              </div>
            )}

            {sandboxError && <div className="card-error-box">{sandboxError}</div>}

            {sandboxResponse && (
              <div className="sandbox-preview">
                <p className="preview-label">Suggested output:</p>
                <div className="diff-view">
                  {sandboxResponse.diff.map((item, idx) => {
                    if (item.op === "insert") {
                      return (
                        <span key={idx} className="diff-insert">
                          {item.text}
                        </span>
                      );
                    }
                    if (item.op === "delete") {
                      return (
                        <span key={idx} className="diff-delete">
                          {item.text}
                        </span>
                      );
                    }
                    return <span key={idx}>{item.text}</span>;
                  })}
                </div>

                {sandboxResponse.transliteration && (
                  <div className="translation-romaji-box">
                    <div className="romaji-header">
                      <span className="romaji-label">
                        {getRomajiLabel(settings?.target_language || "Japanese")}:
                      </span>
                    </div>
                    <div className="romaji-text">{sandboxResponse.transliteration}</div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Preferences & Trigger Behaviors */}
        <div className="settings-col">
          <section className="settings-card">
            <h2>Preferences & Appearance</h2>

            <div className="form-group">
              <label>Interface Theme</label>
              <div className="theme-selector">
                <button
                  type="button"
                  className={`theme-btn ${settings.theme === "dark" ? "active" : ""}`}
                  onClick={() => handleThemeChange("dark")}
                >
                  <span>🌙</span> Dark
                </button>
                <button
                  type="button"
                  className={`theme-btn ${settings.theme === "light" ? "active" : ""}`}
                  onClick={() => handleThemeChange("light")}
                >
                  <span>☀️</span> Light
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="target-lang">Default Target Language</label>
              <select
                id="target-lang"
                value={settings.target_language}
                onChange={(e) =>
                  setSettings({ ...settings, target_language: e.target.value })
                }
              >
                {TARGET_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang === "Indonesian" ? "Indonesian (Bahasa Indonesia)" : lang}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-checkbox-group" style={{ marginTop: "6px" }}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.show_romanization ?? true}
                  onChange={(e) =>
                    setSettings({ ...settings, show_romanization: e.target.checked })
                  }
                />
                <div>
                  <strong>Show Romanization / Romaji</strong>
                  <p>Displays phonetic readings (Romaji, Pinyin, Romaja) below translations for Japanese, Thai, Chinese, Arabic, and Korean.</p>
                </div>
              </label>

              <label className="checkbox-label" style={{ marginTop: "10px" }}>
                <input
                  type="checkbox"
                  checked={settings.autostart ?? true}
                  onChange={(e) =>
                    setSettings({ ...settings, autostart: e.target.checked })
                  }
                />
                <div>
                  <strong>Launch at system startup</strong>
                  <p>Runs Glyphi automatically in the background when your computer turns on.</p>
                </div>
              </label>
            </div>

            <div className="form-group">
              <label htmlFor="global-shortcut">Global Hotkey Shortcut</label>
              <input
                id="global-shortcut"
                type="text"
                value={settings.global_shortcut}
                onChange={(e) =>
                  setSettings({ ...settings, global_shortcut: e.target.value })
                }
                placeholder="Alt+G"
              />
              <span className="field-hint">
                Pressing this shortcut anytime grabs current selection and shows Glyphi.
              </span>
            </div>
          </section>

          <section className="settings-card">
            <h2>Trigger Conditions</h2>
            <div className="form-checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.auto_trigger_selection}
                  onChange={(e) =>
                    setSettings({ ...settings, auto_trigger_selection: e.target.checked })
                  }
                />
                <div>
                  <strong>Show widget on text selection</strong>
                  <p>Pops up the floating widget when text is highlighted anywhere.</p>
                </div>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.auto_trigger_pause}
                  onChange={(e) =>
                    setSettings({ ...settings, auto_trigger_pause: e.target.checked })
                  }
                />
                <div>
                  <strong>Show widget on typing pause</strong>
                  <p>Surfaces an unobtrusive trigger pill when you pause typing.</p>
                </div>
              </label>
            </div>

            {settings.auto_trigger_pause && (
              <div className="form-group range-group">
                <label>
                  Pause delay: <span>{settings.pause_delay_ms / 1000}s</span>
                </label>
                <input
                  type="range"
                  min="800"
                  max="3000"
                  step="200"
                  value={settings.pause_delay_ms}
                  onChange={(e) =>
                    setSettings({ ...settings, pause_delay_ms: Number(e.target.value) })
                  }
                />
              </div>
            )}
          </section>
        </div>
      </div>

      {showCloseModal && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <img src="/app-icon.svg" className="card-brand-logo" alt="Glyphi" />
                <h3>Close Glyphi Settings</h3>
              </div>
            </div>

            <div className="modal-body">
              <p className="modal-intro">
                Would you like to keep Glyphi running in your system tray or close the application completely?
              </p>

              <div className="modal-options-list">
                <button
                  type="button"
                  className="modal-option-card"
                  onClick={handleMinimizeToTray}
                >
                  <span className="modal-option-icon">📥</span>
                  <div className="modal-option-text">
                    <strong>Minimize to System Tray (Recommended)</strong>
                    <span>Glyphi continues running in the background. Your shortcuts and text tools stay active.</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="modal-option-card"
                  onClick={handleExitApp}
                >
                  <span className="modal-option-icon">✕</span>
                  <div className="modal-option-text">
                    <strong>Quit Application Entirely</strong>
                    <span>Closes Glyphi completely and stops all background hotkeys and processes.</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn secondary sm"
                onClick={() => setShowCloseModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
