export interface AppSettings {
  provider: "gemini" | "chatgpt";
  theme: "dark" | "light";
  gemini_api_key: string;
  gemini_model: string;
  openai_api_key: string;
  openai_model: string;
  target_language: string;
  auto_trigger_selection: boolean;
  auto_trigger_pause: boolean;
  pause_delay_ms: number;
  global_shortcut: string;
  grammar_prompt: string;
  translate_prompt: string;
  rewrite_prompt: string;
  show_romanization?: boolean;
  autostart?: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  provider: "gemini",
  theme: "dark",
  gemini_api_key: "",
  gemini_model: "gemini-3.5-flash-lite",
  openai_api_key: "",
  openai_model: "gpt-4o-mini",
  target_language: "English",
  auto_trigger_selection: true,
  auto_trigger_pause: false,
  pause_delay_ms: 1500,
  global_shortcut: "Alt+G",
  grammar_prompt:
    "You are a professional editor. Correct all grammar, spelling, punctuation, and phrasing errors in the original language of the text. Preserve original language, tone, and formatting. Return ONLY the corrected text.",
  translate_prompt:
    "You are an expert translator. Translate the text into {target_language}. Maintain natural idioms, context, and tone. Return ONLY the translated text.",
  rewrite_prompt:
    "Rewrite the following text in its original language to be concise, polished, and professional. Preserve the original language and tone. Return ONLY the rewritten text.",
  show_romanization: true,
  autostart: true,
};

export interface DiffItem {
  op: "equal" | "insert" | "delete";
  text: string;
}

export interface ProcessTextResponse {
  original: string;
  result: string;
  action: string;
  diff: DiffItem[];
  transliteration?: string;
}

export interface TriggerEventPayload {
  text: string;
  x: number;
  y: number;
  trigger_type: "selection" | "pause" | "shortcut";
}
