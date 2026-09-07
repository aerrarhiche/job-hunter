import OpenAI from "openai";
import { cfg } from "../config.js";

/**
 * Minimal LLM abstraction so scoring functions can be unit-tested with a stub
 * instead of hitting the network. The concrete implementation is a thin wrapper
 * around the OpenAI-compatible chat completions API.
 */
export interface LlmClient {
  complete(params: { prompt: string; temperature?: number; maxTokens?: number }): Promise<string>;
}

export function createLLMClient(apiKey: string, baseUrl: string): LlmClient {
  const client = new OpenAI({ apiKey, baseURL: baseUrl });

  return {
    async complete({ prompt, temperature = 0.3, maxTokens = 1500 }) {
      const response = await client.chat.completions.create({
        model: cfg.deepseek.model,
        messages: [{ role: "user", content: prompt }],
        temperature,
        max_tokens: maxTokens,
      });
      return response.choices[0]?.message?.content || "{}";
    },
  };
}

export const llm = createLLMClient(cfg.deepseek.apiKey, cfg.deepseek.baseUrl);
