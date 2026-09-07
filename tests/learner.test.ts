import { describe, it, expect, vi } from "vitest";

// The learner's persistence wrapper needs DB helpers; stub them so the pure
// function can be tested without touching Postgres or loading config.
vi.mock("../src/db/client.js", () => ({
  getJobById: vi.fn(),
  recordDecision: vi.fn(),
  upsertPreference: vi.fn(),
}));

import { learnFromDecision } from "../src/agent/learner.js";
import type { LearnableJob } from "../src/agent/learner.js";

const baseJob: LearnableJob = {
  source: "yc",
  title: "Senior Frontend Engineer",
  company: "Acme",
  salaryMin: 120000,
  salaryMax: 150000,
  location: "Remote",
  metadata: { companySize: "10-50" },
};

describe("learnFromDecision", () => {
  it("produces no signals for neutral or negative actions", () => {
    expect(learnFromDecision({ action: "skipped" }, baseJob)).toEqual([]);
    expect(learnFromDecision({ action: "not_a_fit" }, baseJob)).toEqual([]);
  });

  it("learns the source with applied-level confidence", () => {
    const signals = learnFromDecision({ action: "applied" }, baseJob);
    expect(signals).toContainEqual({
      key: "source",
      value: "yc",
      confidence: 0.7,
      learnedFrom: "applied",
    });
  });

  it("derives salary band, role title, and company size for offers", () => {
    const signals = learnFromDecision({ action: "offered" }, baseJob);
    expect(signals).toEqual([
      { key: "source", value: "yc", confidence: 0.9, learnedFrom: "offered" },
      { key: "salary_band", value: "120k-150k", confidence: 0.9, learnedFrom: "offered" },
      {
        key: "role_title",
        value: "Senior Frontend Engineer",
        confidence: 0.9,
        learnedFrom: "offered",
      },
      { key: "company_size", value: "10-50", confidence: 0.9, learnedFrom: "offered" },
    ]);
  });

  it("omits signals for missing optional fields", () => {
    const job: LearnableJob = {
      source: "linkedin",
      title: "  ",
      company: "Acme",
      salaryMin: null,
      salaryMax: null,
      location: null,
      metadata: null,
    };
    const signals = learnFromDecision({ action: "interviewing" }, job);
    expect(signals).toEqual([
      { key: "source", value: "linkedin", confidence: 0.8, learnedFrom: "interviewing" },
    ]);
  });
});
