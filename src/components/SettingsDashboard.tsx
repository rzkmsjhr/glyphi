import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppSettings, ProcessTextResponse } from "../types";
import { TARGET_LANGUAGES } from "./FloatingWidget";

export const SettingsDashboard: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
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

  // Intercept OS window close request (Windows X, Mac red circle, Linux close)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested((event) => {
        event.preventDefault();
        setShowCloseModal(true);
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.error("Failed to register window close listener:", err);
      });

    return () => {
      if (unlisten) unlisten();
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
    try {
      const data = await invoke<AppSettings>("get_settings");
      if (data.gemini_model === "gemini-2.0-flash" || !data.gemini_model) {
        data.gemini_model = "gemini-3.8-flash";
      }
      if (!data.theme) {
        data.theme = (localStorage.getItem("glyphi-theme") as "dark" | "light") || "dark";
      }
      document.documentElement.setAttribute("data-theme", data.theme);
      localStorage.setItem("glyphi-theme", data.theme);
      setSettings(data);
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  const handleThemeChange = async (newTheme: "dark" | "light") => {
    if (!settings) return;
    const updated = { ...settings, theme: newTheme };
    setSettings(updated);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("glyphi-theme", newTheme);
    try {
      await emit("theme-changed", newTheme);
      await invoke("save_settings", { settings: updated });
    } catch (err) {
      console.error("Failed to sync theme:", err);
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
      settings.provider === "gemini" ? settings.gemini_api_key : settings.openai_api_key;
    const model =
      settings.provider === "gemini" ? settings.gemini_model : settings.openai_model;

    try {
      await invoke("test_api_connection", {
        provider: settings.provider,
        apiKey,
        model,
      });
      setTestResult({ ok: true, msg: "Connection successful." });
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
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Preferences"}
          </button>
          <button
            type="button"
            className="settings-close-btn"
            onClick={() => setShowCloseModal(true)}
            title="Close Settings"
            aria-label="Close Settings"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="2" y1="2" x2="12" y2="12" />
              <line x1="12" y1="2" x2="2" y2="12" />
            </svg>
          </button>
        </div>
      </header>

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
                    <option value="gemini-3.8-flash">gemini-3.8-flash (Fast, free tier & recommended)</option>
                    <option value="gemini-3.5-flash">gemini-3.5-flash (Balanced)</option>
                    <option value="gemini-3.0-flash">gemini-3.0-flash</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash</option>
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
              <button
                type="button"
                className="card-close-btn"
                onClick={() => setShowCloseModal(false)}
                title="Dismiss (Esc)"
                aria-label="Dismiss (Esc)"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="11" y2="11" />
                  <line x1="11" y1="1" x2="1" y2="11" />
                </svg>
              </button>
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
