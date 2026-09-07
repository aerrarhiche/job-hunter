import { describe, it, expect } from "vitest";
import { parseFundingRss } from "../src/scrapers/techcrunch.js";

const xml = `<?xml version="1.0"?><rss><channel>
<item><title>Acme raises $25M Series A</title><link>https://techcrunch.com/a</link></item>
<item><title>Some other news</title><link>https://techcrunch.com/b</link></item>
<item><title>Globex raises $1.2B</title><link>https://techcrunch.com/c</link></item>
</channel></rss>`;

describe("parseFundingRss", () => {
  it("extracts only funding-round items", () => {
    const out = parseFundingRss(xml);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      company: "Acme",
      url: "https://techcrunch.com/a",
      funding: "Acme raises $25M Series A",
    });
  });

  it("returns an empty array for an empty feed", () => {
    expect(parseFundingRss("<rss><channel></channel></rss>")).toEqual([]);
  });

  it("returns an empty array for malformed input", () => {
    expect(parseFundingRss("not xml at all")).toEqual([]);
  });
});
