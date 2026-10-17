import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppSettings, ProcessTextResponse } from "../types";

export const SettingsDashboard: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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

  const loadSettings = async () => {
    try {
      const data = await invoke<AppSettings>("get_settings");
      if (data.gemini_model === "gemini-2.0-flash" || !data.gemini_model) {
        data.gemini_model = "gemini-3.8-flash";
      }
      setSettings(data);
    } catch (err) {
      console.error("Failed to load settings:", err);
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
          targetLanguage: settings?.target_language || "English",
          customPrompt: null,
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
        </div>
      </header>

      <div className="settings-grid">
        {/* Left Column: AI Provider & Triggers */}
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
                className="btn secondary"
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
                  <p>Pops up the floating widget when text is highlighted anywhere in the system.</p>
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
                  <p>Surfaces an unobtrusive trigger pill when you pause typing in any app.</p>
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

            <div className="form-group">
              <label>Global Hotkey Shortcut</label>
              <input
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
        </div>

        {/* Right Column: Language & Interactive Sandbox */}
        <div className="settings-col">
          <section className="settings-card">
            <h2>Language & Translation</h2>
            <div className="form-group">
              <label htmlFor="target-lang">Default Target Language</label>
              <select
                id="target-lang"
                value={settings.target_language}
                onChange={(e) =>
                  setSettings({ ...settings, target_language: e.target.value })
                }
              >
                <option value="English">English</option>
                <option value="Indonesian">Indonesian (Bahasa Indonesia)</option>
                <option value="Spanish">Spanish</option>
                <option value="Japanese">Japanese</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Mandarin Chinese">Mandarin Chinese</option>
                <option value="Portuguese">Portuguese</option>
                <option value="Korean">Korean</option>
              </select>
            </div>
          </section>

          <section className="settings-card sandbox-card">
            <h2>Live Sandbox</h2>
            <p className="card-desc">
              Test grammar checks and translation live with your configured API keys:
            </p>

            <textarea
              className="sandbox-textarea"
              rows={3}
              value={sandboxText}
              onChange={(e) => setSandboxText(e.target.value)}
              placeholder="Type or paste sample text here..."
            />

            <div className="sandbox-actions">
              <button
                className="btn primary sm"
                onClick={() => handleRunSandbox("grammar")}
                disabled={sandboxRunning}
              >
                Check Grammar
              </button>
              <button
                className="btn secondary sm"
                onClick={() => handleRunSandbox("translate")}
                disabled={sandboxRunning}
              >
                Translate to {settings.target_language}
              </button>
              <button
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
      </div>
    </div>
  );
};
