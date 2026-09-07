import { describe, it, expect, vi } from "vitest";

vi.mock("../src/config.js", () => ({
  cfg: {
    deepseek: { model: "deepseek-chat", apiKey: "sk-test", baseUrl: "https://example.com" },
  },
  loadResume: () => "Resume: TypeScript, React, Node.js, AWS",
  loadSoul: () => "Remote only, $120K+, Founding Engineer",
}));

import { scoreJob } from "../src/agent/scorer.js";
import type { LlmClient } from "../src/agent/llm.js";

describe("scoreJob with an injected LLM client", () => {
  it("uses the injected client and parses its structured output", async () => {
    const complete = vi.fn(async () => '{"score": 88, "reason": "great match"}');
    const fakeClient: LlmClient = { complete };

    const result = await scoreJob(
      { title: "Founding Engineer", company: "Acme", description: "TypeScript" },
      fakeClient
    );

    expect(result).toEqual({ score: 88, reason: "great match" });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("returns a fallback when the client returns malformed JSON", async () => {
    const fakeClient: LlmClient = { complete: async () => "not json" };
    const result = await scoreJob(
      { title: "Founding Engineer", company: "Acme", description: "TypeScript" },
      fakeClient
    );

    expect(result).toEqual({ score: 50, reason: "Failed to parse score" });
  });
});
