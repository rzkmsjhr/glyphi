import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AppSettings, ProcessTextResponse, TriggerEventPayload } from "../types";
import { GlyphiGIcon } from "./GlyphiGIcon";

export const TARGET_LANGUAGES = [
  "English",
  "Indonesian",
  "Dutch",
  "German",
  "Arabic",
  "Japanese",
  "Spanish",
  "French",
  "Mandarin Chinese",
  "Korean",
  "Portuguese",
  "Italian",
  "Russian",
  "Vietnamese",
  "Thai",
];

export const getRomajiLabel = (lang: string): string => {
  const l = lang.toLowerCase();
  if (l.includes("japan")) return "Romaji";
  if (l.includes("thai")) return "Romanization";
  if (l.includes("chinese") || l.includes("mandarin")) return "Pinyin";
  if (l.includes("arabic")) return "Transliteration";
  if (l.includes("korean")) return "Romaja";
  return "Romanization";
};

export const FloatingWidget: React.FC = () => {
  const [mode, setMode] = useState<"pill" | "preview">("pill");
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("English");
  const [showTranslatePicker, setShowTranslatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ProcessTextResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedRomaji, setCopiedRomaji] = useState(false);
  const [viewTab, setViewTab] = useState<"diff" | "clean">("diff");
  const [lastAction, setLastAction] = useState<{
    action: "grammar" | "translate" | "rewrite";
    overrideLang?: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyContentRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrameRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resizeWidget = (width: number, height: number) => {
    invoke("resize_floating_widget", { width, height }).catch(() => {});
  };

  const enterPillMode = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    if (animFrameRef.current) {
      clearTimeout(animFrameRef.current);
      animFrameRef.current = null;
    }
    setMode("pill");
    setIsExpanded(false);
    setShowTranslatePicker(false);
    setResponse(null);
    setError(null);
    resizeWidget(44, 44);
  };

  const enterPreviewMode = (width = 440, height = 116) => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    if (animFrameRef.current) {
      clearTimeout(animFrameRef.current);
      animFrameRef.current = null;
    }
    setMode("preview");
    resizeWidget(width, height);
  };

  const handleMouseEnter = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    if (animFrameRef.current) {
      clearTimeout(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mode === "pill" && !isExpanded) {
      resizeWidget(340, 44);
      setIsExpanded(true);
    }
  };

  const handleMouseLeave = () => {
    if (mode !== "pill" || showTranslatePicker) return;

    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
    }

    collapseTimerRef.current = setTimeout(() => {
      setIsExpanded(false);
      animFrameRef.current = setTimeout(() => {
        resizeWidget(44, 44);
      }, 200);
    }, 280);
  };

  const handleCircleClick = () => {
    if (!isExpanded) {
      handleMouseEnter();
    }
  };

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      if (animFrameRef.current) clearTimeout(animFrameRef.current);
    };
  }, []);

  // Dynamically compute and adjust floating window height to hug content
  useEffect(() => {
    if (mode !== "preview") return;

    if (loading) {
      resizeWidget(440, 116);
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const headerH = headerRef.current?.offsetHeight ?? 42;
      const footerH = footerRef.current?.offsetHeight ?? 0;
      const bodyPadding = 24;

      let contentH = 40;
      if (error && errorRef.current) {
        contentH = errorRef.current.scrollHeight;
      } else if (bodyContentRef.current) {
        contentH = bodyContentRef.current.scrollHeight;
      }

      const totalH = headerH + contentH + footerH + bodyPadding;
      const minH = error ? 140 : response?.transliteration ? 180 : 155;
      const clampedH = Math.min(Math.max(totalH, minH), 520);
      resizeWidget(440, Math.round(clampedH));
    });

    return () => cancelAnimationFrame(frameId);
  }, [mode, loading, error, response, viewTab]);

  // Load configured default target language and theme
  useEffect(() => {
    const localTheme = localStorage.getItem("glyphi-theme") || "dark";
    document.documentElement.setAttribute("data-theme", localTheme);

    invoke<AppSettings>("get_settings")
      .then((s) => {
        if (s && s.theme) {
          document.documentElement.setAttribute("data-theme", s.theme);
          localStorage.setItem("glyphi-theme", s.theme);
        }
        if (s && s.target_language) {
          setTargetLanguage(s.target_language);
        }
      })
      .catch(() => {});

    const unlistenTheme = listen<string>("theme-changed", (event) => {
      document.documentElement.setAttribute("data-theme", event.payload);
      localStorage.setItem("glyphi-theme", event.payload);
    });

    return () => {
      unlistenTheme.then((u) => u());
    };
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
      enterPreviewMode(440, 150);
      return;
    }

    enterPreviewMode(440, 116);
    setLoading(true);
    setError(null);

    // Default to clean output for translation, diff for grammar/polish
    if (action === "translate") {
      setViewTab("clean");
    } else {
      setViewTab("diff");
    }

    const langToUse = overrideLang || targetLanguage || "English";
    setLastAction({ action, overrideLang: langToUse });

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

  const handleCopyRomaji = async (text: string) => {
    await invoke("copy_to_clipboard", { text });
    setCopiedRomaji(true);
    setTimeout(() => setCopiedRomaji(false), 2000);
  };

  const handleDismiss = async () => {
    enterPillMode();
    await invoke("hide_floating_widget");
  };

  if (mode === "pill") {
    return (
      <div
        className={`floating-pill-container ${isExpanded ? "expanded" : "collapsed"}`}
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {showTranslatePicker ? (
          <div className="pill-translate-content">
            <button
              type="button"
              className="pill-back-btn"
              onClick={() => {
                setShowTranslatePicker(false);
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
        ) : (
          <>
            <button
              type="button"
              className="pill-brand-btn"
              onClick={handleCircleClick}
              title={isExpanded ? "Glyphi" : "Glyphi: Click or hover to open"}
              aria-label="Glyphi"
            >
              <GlyphiGIcon size={22} className="pill-logo" />
            </button>

            {isExpanded && (
              <div className="pill-expanded-content">
                <div className="pill-divider" />

                <div className="pill-actions">
                  <button
                    type="button"
                    className="pill-btn"
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
            )}
          </>
        )}
      </div>
    );
  }

  // Preview Mode
  return (
    <div className="floating-card-container">
      <div className="card-header" ref={headerRef}>
        <div className="card-title">
          <GlyphiGIcon size={18} className="card-brand-logo" />
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
          <div className="card-error-box" ref={errorRef}>
            <div className="error-box-header">
              <p className="error-title">Request Issue</p>
              {lastAction && (
                <button
                  type="button"
                  className="retry-btn"
                  onClick={() => handleAction(lastAction.action, lastAction.overrideLang)}
                  disabled={loading}
                >
                  Retry
                </button>
              )}
            </div>
            <p className="error-detail">{error}</p>
          </div>
        )}

        {!loading && !error && response && (
          <div className="card-content-area" ref={bodyContentRef}>
            {response.action === "translate" ? (
              viewTab === "diff" ? (
                <div className="source-preview">
                  <div className="view-section-label">Original Source Text:</div>
                  <div className="clean-output-view">{response.original}</div>
                </div>
              ) : (
                <>
                  <div className="clean-output-view">{response.result}</div>
                  {response.transliteration && (
                    <div className="translation-romaji-box">
                      <div className="romaji-header">
                        <span className="romaji-label">
                          {getRomajiLabel(lastAction?.overrideLang || targetLanguage)}:
                        </span>
                        <button
                          type="button"
                          className="romaji-copy-btn"
                          onClick={() => handleCopyRomaji(response.transliteration!)}
                          title="Copy reading"
                        >
                          {copiedRomaji ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <div className="romaji-text">{response.transliteration}</div>
                    </div>
                  )}
                </>
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
        <div className="card-footer" ref={footerRef}>
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
