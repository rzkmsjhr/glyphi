import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ProcessTextResponse, TriggerEventPayload } from "../types";

export const FloatingWidget: React.FC = () => {
  const [mode, setMode] = useState<"pill" | "preview">("pill");
  const [selectedText, setSelectedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ProcessTextResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewTab, setViewTab] = useState<"diff" | "clean">("diff");
  const containerRef = useRef<HTMLDivElement>(null);

  // Listen for trigger events from the Rust background listener
  useEffect(() => {
    const unlistenPromise = listen<TriggerEventPayload>("trigger-pill", (event) => {
      setSelectedText(event.payload.text);
      setResponse(null);
      setError(null);
      setMode("pill");
      invoke("resize_floating_widget", { width: 340, height: 50 });
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleAction = async (action: "grammar" | "translate" | "rewrite") => {
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
      setMode("preview");
      invoke("resize_floating_widget", { width: 420, height: 260 });
      return;
    }

    setMode("preview");
    setLoading(true);
    setError(null);
    invoke("resize_floating_widget", { width: 440, height: 340 });

    try {
      const res = await invoke<ProcessTextResponse>("process_text", {
        req: {
          action,
          text: textToProcess,
          targetLanguage: null,
          customPrompt: null,
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
    setMode("pill");
    setResponse(null);
    setError(null);
    await invoke("hide_floating_widget");
  };

  if (mode === "pill") {
    return (
      <div className="floating-pill-container" ref={containerRef}>
        <div className="pill-brand">
          <span className="brand-dot" />
          <span className="brand-label">Glyphi</span>
        </div>
        <div className="pill-actions">
          <button
            className="pill-btn primary"
            onClick={() => handleAction("grammar")}
            title="Check Grammar & Spelling"
          >
            Grammar
          </button>
          <button
            className="pill-btn"
            onClick={() => handleAction("translate")}
            title="Translate Text"
          >
            Translate
          </button>
          <button
            className="pill-btn"
            onClick={() => handleAction("rewrite")}
            title="Polish Tone & Phrasing"
          >
            Polish
          </button>
          <button
            className="pill-btn close-btn"
            onClick={handleDismiss}
            title="Dismiss (Esc)"
          >
            ✕
          </button>
        </div>
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
          {response && (
            <div className="view-toggle">
              <button
                className={`toggle-btn ${viewTab === "diff" ? "active" : ""}`}
                onClick={() => setViewTab("diff")}
              >
                Changes
              </button>
              <button
                className={`toggle-btn ${viewTab === "clean" ? "active" : ""}`}
                onClick={() => setViewTab("clean")}
              >
                Output
              </button>
            </div>
          )}
          <button className="card-close-btn" onClick={handleDismiss} title="Close (Esc)">
            ✕
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
            {viewTab === "diff" ? (
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
            <button className="btn secondary" onClick={handleCopyAll}>
              {copied ? "Copied" : "Copy All"}
            </button>
          </div>
          <div className="footer-right">
            <button className="btn outline" onClick={handleDismiss}>
              Discard
            </button>
            <button className="btn primary" onClick={handleApply}>
              Apply Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
