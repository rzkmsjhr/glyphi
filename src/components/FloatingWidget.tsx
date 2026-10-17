import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AppSettings, ProcessTextResponse, TriggerEventPayload } from "../types";

export const TARGET_LANGUAGES = [
  "Indonesian",
  "English",
  "Spanish",
  "Japanese",
  "French",
  "German",
  "Mandarin Chinese",
  "Korean",
  "Portuguese",
  "Italian",
  "Arabic",
  "Russian",
  "Dutch",
  "Vietnamese",
  "Thai",
];

export const FloatingWidget: React.FC = () => {
  const [mode, setMode] = useState<"pill" | "preview">("pill");
  const [selectedText, setSelectedText] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("Indonesian");
  const [showTranslatePicker, setShowTranslatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ProcessTextResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewTab, setViewTab] = useState<"diff" | "clean">("diff");
  const containerRef = useRef<HTMLDivElement>(null);

  const enterPillMode = () => {
    setMode("pill");
    setShowTranslatePicker(false);
    setResponse(null);
    setError(null);
    invoke("resize_floating_widget", { width: 370, height: 44 });
  };

  const enterPreviewMode = (width = 440, height = 320) => {
    setMode("preview");
    invoke("resize_floating_widget", { width, height });
  };

  // Load configured default target language
  useEffect(() => {
    invoke<AppSettings>("get_settings")
      .then((s) => {
        if (s && s.target_language) {
          setTargetLanguage(s.target_language);
        }
      })
      .catch(() => {});
  }, []);

  // Listen for trigger events from the Rust background listener
  useEffect(() => {
    enterPillMode();

    const unlistenPromise = listen<TriggerEventPayload>("trigger-pill", (event) => {
      setSelectedText(event.payload.text);
      enterPillMode();
    });

    const unlistenDismiss = listen("dismiss-floating", () => {
      enterPillMode();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      unlistenDismiss.then((unlisten) => unlisten());
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleAction = async (
    action: "grammar" | "translate" | "rewrite",
    overrideLang?: string
  ) => {
    let textToProcess = selectedText.trim();

    // If text was empty, try to grab from clipboard
    if (!textToProcess) {
      try {
        const grabbed = await invoke<string>("grab_selected_text");
        if (grabbed && grabbed.trim()) {
          textToProcess = grabbed.trim();
          setSelectedText(textToProcess);
        }
      } catch {
        // Fallback
      }
    }

    if (!textToProcess) {
      setError("Please select text first.");
      enterPreviewMode(420, 240);
      return;
    }

    enterPreviewMode(440, 320);
    setLoading(true);
    setError(null);

    // Default to clean output for translation, diff for grammar/polish
    if (action === "translate") {
      setViewTab("clean");
    } else {
      setViewTab("diff");
    }

    const langToUse = overrideLang || targetLanguage || "Indonesian";

    try {
      const res = await invoke<ProcessTextResponse>("process_text", {
        req: {
          action,
          text: textToProcess,
          target_language: action === "translate" ? langToUse : null,
          custom_prompt: null,
        },
      });
      setResponse(res);
    } catch (err: any) {
      setError(typeof err === "string" ? err : err.message || "Failed to process text.");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!response) return;
    try {
      await invoke("apply_replacement", { newText: response.result });
    } catch (err: any) {
      setError("Failed to paste replacement text.");
    }
  };

  const handleCopyAll = async () => {
    if (!response) return;
    await invoke("copy_to_clipboard", { text: response.result });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDismiss = async () => {
    enterPillMode();
    await invoke("hide_floating_widget");
  };

  if (mode === "pill") {
    if (showTranslatePicker) {
      return (
        <div className="floating-pill-container" ref={containerRef}>
          <button
            type="button"
            className="pill-back-btn"
            onClick={() => {
              setShowTranslatePicker(false);
              invoke("resize_floating_widget", { width: 370, height: 44 });
            }}
            title="Back to actions"
            aria-label="Back to actions"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="10 13 5 8 10 3" />
            </svg>
          </button>

          <span className="pill-translate-label">To:</span>

          <select
            className="pill-lang-select"
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleAction("translate", targetLanguage);
              }
            }}
            autoFocus
          >
            {TARGET_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="pill-btn primary"
            onClick={() => handleAction("translate", targetLanguage)}
            title="Translate to selected language"
          >
            Translate
          </button>

          <div className="pill-divider" />

          <button
            type="button"
            className="pill-close-btn"
            onClick={handleDismiss}
            title="Dismiss (Esc)"
            aria-label="Dismiss (Esc)"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>
        </div>
      );
    }

    return (
      <div className="floating-pill-container" ref={containerRef}>
        <div className="pill-brand">
          <span className="brand-dot" />
          <span className="brand-label">Glyphi</span>
        </div>

        <div className="pill-divider" />

        <div className="pill-actions">
          <button
            type="button"
            className="pill-btn primary"
            onClick={() => handleAction("grammar")}
            title="Check Grammar and Spelling"
          >
            Grammar
          </button>
          <button
            type="button"
            className="pill-btn"
            onClick={() => {
              setShowTranslatePicker(true);
              invoke("resize_floating_widget", { width: 390, height: 44 });
            }}
            title="Select target language and translate"
          >
            Translate ▾
          </button>
          <button
            type="button"
            className="pill-btn"
            onClick={() => handleAction("rewrite")}
            title="Polish Tone and Phrasing"
          >
            Polish
          </button>
        </div>

        <div className="pill-divider" />

        <button
          type="button"
          className="pill-close-btn"
          onClick={handleDismiss}
          title="Dismiss (Esc)"
          aria-label="Dismiss (Esc)"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="1" y1="1" x2="11" y2="11" />
            <line x1="11" y1="1" x2="1" y2="11" />
          </svg>
        </button>
      </div>
    );
  }

  // Preview Mode
  return (
    <div className="floating-card-container">
      <div className="card-header">
        <div className="card-title">
          <span className="brand-dot" />
          <span>
            {response
              ? response.action === "grammar"
                ? "Grammar Fix"
                : response.action === "translate"
                ? "Translation"
                : "Polished Text"
              : "Processing"}
          </span>
        </div>
        <div className="card-header-actions">
          {response && response.action === "translate" && (
            <div className="card-lang-selector">
              <span className="card-lang-label">To:</span>
              <select
                className="card-lang-select"
                value={targetLanguage}
                onChange={(e) => {
                  const newLang = e.target.value;
                  setTargetLanguage(newLang);
                  handleAction("translate", newLang);
                }}
                title="Switch target translation language"
              >
                {TARGET_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
          )}

          {response && response.action === "translate" ? (
            <div className="view-toggle">
              <button
                type="button"
                className={`toggle-btn ${viewTab === "clean" ? "active" : ""}`}
                onClick={() => setViewTab("clean")}
              >
                Translation
              </button>
              <button
                type="button"
                className={`toggle-btn ${viewTab === "diff" ? "active" : ""}`}
                onClick={() => setViewTab("diff")}
              >
                Original
              </button>
            </div>
          ) : response ? (
            <div className="view-toggle">
              <button
                type="button"
                className={`toggle-btn ${viewTab === "diff" ? "active" : ""}`}
                onClick={() => setViewTab("diff")}
              >
                Changes
              </button>
              <button
                type="button"
                className={`toggle-btn ${viewTab === "clean" ? "active" : ""}`}
                onClick={() => setViewTab("clean")}
              >
                Output
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="card-close-btn"
            onClick={handleDismiss}
            title="Close (Esc)"
            aria-label="Close (Esc)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11" />
              <line x1="11" y1="1" x2="1" y2="11" />
            </svg>
          </button>
        </div>
      </div>

      <div className="card-body">
        {loading && (
          <div className="card-status-message">
            <div className="loading-indicator" />
            <p>Analyzing and refining text...</p>
          </div>
        )}

        {error && (
          <div className="card-error-box">
            <p className="error-title">Error</p>
            <p className="error-detail">{error}</p>
          </div>
        )}

        {!loading && !error && response && (
          <div className="card-content-area">
            {response.action === "translate" ? (
              viewTab === "diff" ? (
                <div className="source-preview">
                  <div className="view-section-label">Original Source Text:</div>
                  <div className="clean-output-view">{response.original}</div>
                </div>
              ) : (
                <div className="clean-output-view">{response.result}</div>
              )
            ) : viewTab === "diff" ? (
              <div className="diff-view">
                {response.diff.map((item, idx) => {
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
            ) : (
              <div className="clean-output-view">{response.result}</div>
            )}
          </div>
        )}
      </div>

      {response && !loading && (
        <div className="card-footer">
          <div className="footer-left">
            <button type="button" className="btn secondary sm" onClick={handleCopyAll}>
              {copied ? "Copied" : "Copy All"}
            </button>
          </div>
          <div className="footer-right">
            <button type="button" className="btn outline sm" onClick={handleDismiss}>
              Discard
            </button>
            <button type="button" className="btn primary sm" onClick={handleApply}>
              Apply Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
