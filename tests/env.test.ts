import { describe, it, expect } from "vitest";
import { parseEnv } from "../src/env.js";

function raw(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe("parseEnv", () => {
  it("applies documented defaults when no values are provided", () => {
    const cfg = parseEnv(raw());
    expect(cfg.deepseek.apiKey).toBe("");
    expect(cfg.deepseek.baseUrl).toBe("https://api.deepseek.com");
    expect(cfg.postgres.port).toBe(5432);
    expect(cfg.schedule.hour).toBe(7);
    expect(cfg.search.minSalary).toBe(120000);
    expect(cfg.search.minScore).toBe(70);
    expect(cfg.search.remoteOnly).toBe(true);
  });

  it("parses provided values and coerces types", () => {
    const cfg = parseEnv(
      raw({
        POSTGRES_PORT: "5433",
        SEARCH_MIN_SCORE: "80",
        SEARCH_REMOTE_ONLY: "false",
      })
    );
    expect(cfg.postgres.port).toBe(5433);
    expect(cfg.search.minScore).toBe(80);
    expect(cfg.search.remoteOnly).toBe(false);
  });

  it("lowercases and trims keyword lists", () => {
    const cfg = parseEnv(
      raw({
        SEARCH_EXCLUDE_KEYWORDS: " Crypto, Web3 ",
        SEARCH_MUST_HAVE: " TypeScript, Node.js ",
      })
    );
    expect(cfg.search.excludeKeywords).toEqual(["crypto", "web3"]);
    expect(cfg.search.mustHave).toEqual(["typescript", "node.js"]);
  });

  it("throws on a malformed numeric value", () => {
    expect(() => parseEnv(raw({ POSTGRES_PORT: "not-a-number" }))).toThrow();
  });
});
