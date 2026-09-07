import { describe, it, expect } from "vitest";
import { applyHardPenalties } from "../src/agent/scoring-rules.js";
import type { ScrapedJob } from "../src/scrapers/types.js";

function job(overrides: Partial<ScrapedJob> = {}): ScrapedJob {
  return {
    title: "Founding Engineer",
    company: "Acme",
    location: "Remote",
    url: "https://example.com/1",
    description: "",
    source: "yc",
    ...overrides,
  };
}

describe("applyHardPenalties", () => {
  it("applies no penalty for a remote, well-paid, target role", () => {
    const result = applyHardPenalties(80, job());
    expect(result.score).toBe(80);
    expect(result.penalties).toEqual([]);
  });

  it("docks 30 points for an on-site location", () => {
    const result = applyHardPenalties(80, job({ location: "San Francisco, CA" }));
    expect(result.score).toBe(50);
    expect(result.penalties).toContain("on-site/no-remote (-30)");
  });

  it("docks 20 points for salary below the floor", () => {
    const result = applyHardPenalties(80, job({ salaryMin: 100000 }));
    expect(result.score).toBe(60);
    expect(result.penalties.some((p) => p.startsWith("salary"))).toBe(true);
  });

  it("docks 25 points for a non-target role", () => {
    const result = applyHardPenalties(80, job({ title: "Backend Engineer" }));
    expect(result.score).toBe(55);
    expect(result.penalties).toContain("non-target role (-25)");
  });

  it("does not penalize a non-target word when a target title overrides", () => {
    const result = applyHardPenalties(80, job({ title: "Founding Backend Engineer" }));
    expect(result.score).toBe(80);
    expect(result.penalties).toEqual([]);
  });

  it("clamps the final score at zero", () => {
    const result = applyHardPenalties(
      10,
      job({ location: "New York, NY", salaryMin: 90000, title: "Backend Engineer" })
    );
    expect(result.score).toBe(0);
  });
});
