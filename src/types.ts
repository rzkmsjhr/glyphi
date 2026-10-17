export interface AppSettings {
  provider: "gemini" | "chatgpt";
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
}

export interface DiffItem {
  op: "equal" | "insert" | "delete";
  text: string;
}

export interface ProcessTextResponse {
  original: string;
  result: string;
  action: string;
  diff: DiffItem[];
}

export interface TriggerEventPayload {
  text: string;
  x: number;
  y: number;
  trigger_type: "selection" | "pause" | "shortcut";
}
