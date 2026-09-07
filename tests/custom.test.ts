import { describe, it, expect } from "vitest";
import { mapAIExtractResult } from "../src/scrapers/custom.js";

describe("mapAIExtractResult", () => {
  it("maps jobs and preserves selectors", () => {
    const result = mapAIExtractResult(
      {
        jobs: [
          { title: "SWE", company: "Acme", location: "Remote", url: "u", description: "desc" },
        ],
        selectors: { cardSelector: ".job-card" },
      },
      "mysite"
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({ title: "SWE", company: "Acme", source: "mysite" });
    expect(result.selectors).toEqual({ cardSelector: ".job-card" });
  });

  it("defaults missing fields and a null selector map", () => {
    const result = mapAIExtractResult({ jobs: [{}], selectors: null }, "mysite");
    expect(result.jobs[0]).toMatchObject({
      title: "",
      company: "",
      location: "",
      url: "",
      description: "",
      source: "mysite",
    });
    expect(result.selectors).toBeNull();
  });

  it("handles missing jobs and selectors", () => {
    const result = mapAIExtractResult({}, "mysite");
    expect(result.jobs).toEqual([]);
    expect(result.selectors).toBeNull();
  });
});
