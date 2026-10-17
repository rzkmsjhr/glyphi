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
        let (system_prompt, user_content) = match req.action.as_str() {
            "grammar" => {
                let prompt = req
                    .custom_prompt
                    .as_deref()
                    .unwrap_or(&settings.grammar_prompt);
                (prompt.to_string(), req.text.clone())
            }
            "translate" => {
                let lang = req
                    .target_language
                    .as_deref()
                    .unwrap_or(&settings.target_language);
                let template = req
                    .custom_prompt
                    .as_deref()
                    .unwrap_or(&settings.translate_prompt);
                let prompt = template.replace("{target_language}", lang);
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

        let trimmed_result = result.trim().to_string();
        let diff = compute_diff(&req.text, &trimmed_result);

        Ok(ProcessTextResponse {
            original: req.text.clone(),
            result: trimmed_result,
            action: req.action.clone(),
            diff,
        })
    }

    async fn call_gemini(
        &self,
        api_key: &str,
        model: &str,
        prompt: &str,
    ) -> Result<String, String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            model, api_key
        );

        let body = json!({
            "contents": [{
                "parts": [{ "text": prompt }]
            }],
            "generationConfig": {
                "temperature": 0.2
            }
        });

        let res = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error calling Gemini: {}", e))?;

        if !res.status().is_success() {
            let error_text = res.text().await.unwrap_or_default();
            return Err(format!("Gemini API error: {}", error_text));
        }

        let json_val: serde_json::Value = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse Gemini response: {}", e))?;

        if let Some(text) = json_val["candidates"][0]["content"]["parts"][0]["text"].as_str() {
            Ok(text.to_string())
        } else {
            Err("No text generated in Gemini response".to_string())
        }
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
