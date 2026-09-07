import { describe, it, expect } from "vitest";
import { dedupeJobs, filterJobs, type SearchConfig } from "../src/agent/filter.js";
import type { ScrapedJob } from "../src/scrapers/types.js";

const config: SearchConfig = {
  excludeKeywords: ["crypto"],
  mustHave: ["typescript"],
  roleTitles: ["Founding Engineer", "Full-Stack Engineer"],
  locations: ["United States", "Remote"],
  minSalary: 120000,
  minScore: 70,
  remoteOnly: true,
};

function job(overrides: Partial<ScrapedJob> = {}): ScrapedJob {
  return {
    title: "Founding Engineer",
    company: "Acme",
    location: "Remote",
    url: "https://example.com/1",
    description: "We use TypeScript across the stack",
    source: "yc",
    ...overrides,
  };
}

describe("dedupeJobs", () => {
  it("removes duplicate URLs", () => {
    const out = dedupeJobs([job(), job(), job({ url: "https://example.com/2" })]);
    expect(out).toHaveLength(2);
  });

  it("drops jobs missing a title or company", () => {
    const out = dedupeJobs([job({ title: "" }), job({ company: "" }), job()]);
    expect(out).toHaveLength(1);
  });
});

describe("filterJobs", () => {
  it("excludes jobs with an excluded keyword", () => {
    expect(filterJobs([job({ description: "crypto startup" })], config)).toHaveLength(0);
  });

  it("requires a role or tech match", () => {
    expect(filterJobs([job({ title: "Accountant", description: "no tech" })], config)).toHaveLength(
      0
    );
  });

  it("rejects on-site when remoteOnly is set", () => {
    expect(filterJobs([job({ location: "On-site only" })], config)).toHaveLength(0);
  });

  it("rejects a non-matching location", () => {
    expect(filterJobs([job({ location: "Berlin, Germany" })], config)).toHaveLength(0);
  });

  it("rejects a salary below the floor", () => {
    expect(filterJobs([job({ salaryMin: 90000 })], config)).toHaveLength(0);
  });

  it("keeps a matching job", () => {
    expect(filterJobs([job()], config)).toHaveLength(1);
  });
});
