use crate::models::{AppSettings, DiffItem, ProcessTextRequest, ProcessTextResponse};
use reqwest::Client;
use serde_json::json;

pub struct AiService {
    client: Client,
}

impl AiService {
    pub fn new() -> Self {
        Self {
            client: Client::builder().build().unwrap_or_default(),
        }
    }

    pub async fn test_connection(
        &self,
        provider: &str,
        api_key: &str,
        model: &str,
    ) -> Result<String, String> {
        if api_key.trim().is_empty() {
            return Err("API key cannot be empty".to_string());
        }

        match provider {
            "gemini" => self.call_gemini(api_key, model, "Ping: reply with 'OK'").await,
            "chatgpt" => {
                self.call_openai(
                    api_key,
                    model,
                    "You are a helpful assistant.",
                    "Ping: reply with 'OK'",
                )
                .await
            }
            _ => Err(format!("Unsupported provider: {}", provider)),
        }
    }

    pub async fn process_text(
        &self,
        settings: &AppSettings,
        req: &ProcessTextRequest,
    ) -> Result<ProcessTextResponse, String> {
        let is_trans = req.action == "translate";
        let target_lang = req
            .target_language
            .as_deref()
            .unwrap_or(&settings.target_language);
        let needs_romaji = is_trans && settings.show_romanization && is_phonetic_target_lang(target_lang);

        let (system_prompt, user_content) = match req.action.as_str() {
            "grammar" => {
                let prompt = req
                    .custom_prompt
                    .as_deref()
                    .unwrap_or(&settings.grammar_prompt);
                (prompt.to_string(), req.text.clone())
            }
            "translate" => {
                let template = req
                    .custom_prompt
                    .as_deref()
                    .unwrap_or(&settings.translate_prompt);
                let base_prompt = template.replace("{target_language}", target_lang);
                let prompt = if needs_romaji {
                    format!(
                        "{}\n\nIMPORTANT: You must also provide the phonetic Latin reading / romanization (Romaji for Japanese, Pinyin for Chinese, Romaja for Korean, phonetic Latin transliteration for Thai and Arabic).\nFormat your response EXACTLY as:\n[Translated text in native script]\nROMANIZATION: [Phonetic romanization text in Latin alphabet]\nDo not add any other commentary or prefix.",
                        base_prompt
                    )
                } else {
                    base_prompt
                };
                (prompt, req.text.clone())
            }
            "rewrite" => {
                let prompt = req
                    .custom_prompt
                    .as_deref()
                    .unwrap_or(&settings.rewrite_prompt);
                (prompt.to_string(), req.text.clone())
            }
            _ => return Err(format!("Unknown action: {}", req.action)),
        };

        let result = match settings.provider.as_str() {
            "gemini" => {
                let full_prompt = format!("{}\n\nText:\n{}", system_prompt, user_content);
                self.call_gemini(&settings.gemini_api_key, &settings.gemini_model, &full_prompt)
                    .await?
            }
            "chatgpt" => {
                self.call_openai(
                    &settings.openai_api_key,
                    &settings.openai_model,
                    &system_prompt,
                    &user_content,
                )
                .await?
            }
            _ => return Err(format!("Unsupported provider: {}", settings.provider)),
        };

        let (trimmed_result, transliteration) = if needs_romaji {
            parse_translation_and_transliteration(&result)
        } else {
            (result.trim().to_string(), None)
        };

        let diff = compute_diff(&req.text, &trimmed_result);

        Ok(ProcessTextResponse {
            original: req.text.clone(),
            result: trimmed_result,
            action: req.action.clone(),
            diff,
            transliteration,
        })
    }

    async fn call_gemini(
        &self,
        api_key: &str,
        model: &str,
        prompt: &str,
    ) -> Result<String, String> {
        let candidate_models: Vec<&str> = match model {
            "gemini-3.8-flash" => vec!["gemini-3.8-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"],
            "gemini-3.5-flash" => vec!["gemini-3.5-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"],
            "gemini-2.5-flash" => vec!["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"],
            "gemini-2.0-flash" => vec!["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"],
            "gemini-1.5-flash" => vec!["gemini-1.5-flash", "gemini-2.5-flash", "gemini-2.0-flash"],
            _ => vec![model, "gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"],
        };

        let mut last_err = String::new();

        for (idx, target_model) in candidate_models.iter().enumerate() {
            let url = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                target_model, api_key
            );

            let body = json!({
                "contents": [{
                    "parts": [{ "text": prompt }]
                }],
                "generationConfig": {
                    "temperature": 0.2
                }
            });

            for attempt in 0..2 {
                let res = self
                    .client
                    .post(&url)
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("Network error calling Gemini: {}", e))?;

                let status = res.status();
                if status.is_success() {
                    let json_val: serde_json::Value = res
                        .json()
                        .await
                        .map_err(|e| format!("Failed to parse Gemini response: {}", e))?;

                    if let Some(text) = json_val["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                        return Ok(text.to_string());
                    } else {
                        return Err("No text generated in Gemini response".to_string());
                    }
                }

                let error_text = res.text().await.unwrap_or_default();
                let clean_msg = parse_gemini_error(&error_text);

                // Handle 503 (high demand) or 429 (rate limit)
                if status.as_u16() == 503 || status.as_u16() == 429 {
                    last_err = clean_msg;
                    if attempt == 0 {
                        tokio::time::sleep(std::time::Duration::from_millis(700)).await;
                        continue;
                    }
                    break;
                } else if status.as_u16() == 404 {
                    // Model name not found on v1beta endpoint, try next candidate
                    last_err = clean_msg;
                    break;
                } else {
                    // Fatal client error (e.g. 400 invalid key, 403)
                    return Err(clean_msg);
                }
            }

            if idx + 1 < candidate_models.len() {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            }
        }

        Err(if last_err.is_empty() {
            "Gemini servers are currently experiencing high demand. Please try again shortly.".to_string()
        } else {
            last_err
        })
    }

    async fn call_openai(
        &self,
        api_key: &str,
        model: &str,
        system_prompt: &str,
        user_prompt: &str,
    ) -> Result<String, String> {
        let url = "https://api.openai.com/v1/chat/completions";

        let body = json!({
            "model": model,
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_prompt }
            ],
            "temperature": 0.2
        });

        let res = self
            .client
            .post(url)
            .bearer_auth(api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error calling OpenAI: {}", e))?;

        if !res.status().is_success() {
            let error_text = res.text().await.unwrap_or_default();
            return Err(format!("OpenAI API error: {}", error_text));
        }

        let json_val: serde_json::Value = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

        if let Some(content) = json_val["choices"][0]["message"]["content"].as_str() {
            Ok(content.to_string())
        } else {
            Err("No content returned in OpenAI response".to_string())
        }
    }
}

/// Simple word-level diff calculation
fn compute_diff(original: &str, revised: &str) -> Vec<DiffItem> {
    let orig_words: Vec<&str> = original.split_inclusive(char::is_whitespace).collect();
    let rev_words: Vec<&str> = revised.split_inclusive(char::is_whitespace).collect();

    let mut items = Vec::new();
    let mut i = 0;
    let mut j = 0;

    while i < orig_words.len() && j < rev_words.len() {
        if orig_words[i] == rev_words[j] {
            items.push(DiffItem {
                op: "equal".to_string(),
                text: orig_words[i].to_string(),
            });
            i += 1;
            j += 1;
        } else {
            // Check if word was inserted or deleted
            let next_match_rev = rev_words[j..].iter().position(|&w| w == orig_words[i]);
            let next_match_orig = orig_words[i..].iter().position(|&w| w == rev_words[j]);

            match (next_match_rev, next_match_orig) {
                (Some(offset_rev), Some(offset_orig)) => {
                    if offset_rev <= offset_orig {
                        for k in j..j + offset_rev {
                            items.push(DiffItem {
                                op: "insert".to_string(),
                                text: rev_words[k].to_string(),
                            });
                        }
                        j += offset_rev;
                    } else {
                        for k in i..i + offset_orig {
                            items.push(DiffItem {
                                op: "delete".to_string(),
                                text: orig_words[k].to_string(),
                            });
                        }
                        i += offset_orig;
                    }
                }
                (Some(offset_rev), None) => {
                    for k in j..j + offset_rev {
                        items.push(DiffItem {
                            op: "insert".to_string(),
                            text: rev_words[k].to_string(),
                        });
                    }
                    j += offset_rev;
                }
                (None, Some(offset_orig)) => {
                    for k in i..i + offset_orig {
                        items.push(DiffItem {
                            op: "delete".to_string(),
                            text: orig_words[k].to_string(),
                        });
                    }
                    i += offset_orig;
                }
                (None, None) => {
                    items.push(DiffItem {
                        op: "delete".to_string(),
                        text: orig_words[i].to_string(),
                    });
                    items.push(DiffItem {
                        op: "insert".to_string(),
                        text: rev_words[j].to_string(),
                    });
                    i += 1;
                    j += 1;
                }
            }
        }
    }

    while i < orig_words.len() {
        items.push(DiffItem {
            op: "delete".to_string(),
            text: orig_words[i].to_string(),
        });
        i += 1;
    }

    while j < rev_words.len() {
        items.push(DiffItem {
            op: "insert".to_string(),
            text: rev_words[j].to_string(),
        });
        j += 1;
    }

    items
}

fn parse_gemini_error(error_text: &str) -> String {
    if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(error_text) {
        if let Some(msg) = json_val["error"]["message"].as_str() {
            if msg.contains("high demand") || msg.contains("503") || msg.contains("UNAVAILABLE") {
                return "Gemini service is temporarily experiencing high demand. Please try again shortly, or switch models in Settings.".to_string();
            }
            return msg.to_string();
        }
    }
    format!("Gemini API error: {}", error_text)
}

fn is_phonetic_target_lang(lang: &str) -> bool {
    let l = lang.to_lowercase();
    l.contains("japan")
        || l.contains("thai")
        || l.contains("chinese")
        || l.contains("mandarin")
        || l.contains("arabic")
        || l.contains("korean")
}

fn parse_translation_and_transliteration(raw: &str) -> (String, Option<String>) {
    let lower = raw.to_lowercase();
    let markers = [
        "romanization:",
        "romaji:",
        "pinyin:",
        "romaja:",
        "transliteration:",
        "pronunciation:",
    ];

    for marker in &markers {
        if let Some(pos) = lower.find(marker) {
            let translation_part = raw[..pos].trim().trim_end_matches(['*', '_', '`', ' ', ':']);
            let transliteration_part = raw[pos + marker.len()..]
                .trim()
                .trim_matches(['*', '_', '`', ' ']);
            if !translation_part.is_empty() && !transliteration_part.is_empty() {
                return (
                    translation_part.to_string(),
                    Some(transliteration_part.to_string()),
                );
            }
        }
    }

    (raw.trim().to_string(), None)
}
