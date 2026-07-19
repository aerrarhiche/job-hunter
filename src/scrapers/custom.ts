import puppeteer from "puppeteer";
import OpenAI from "openai";
import { cfg } from "../config.js";
import type { ScrapedJob } from "./types.js";
import { updateScraperSelectors } from "../db/client.js";
import type { ScraperRow } from "../db/client.js";

const ai = new OpenAI({
  apiKey: cfg.deepseek.apiKey,
  baseURL: cfg.deepseek.baseUrl,
});

/**
 * Run a custom scraper based on its DB configuration.
 *
 * If `scraper.selectors` is populated, the scraper uses those CSS selectors
 * directly.  Otherwise it sends the page text to DeepSeek to auto-detect job
 * listings – and saves the suggested selectors back to the DB for next time.
 */
export async function scrapeCustom(
  scraper: ScraperRow
): Promise<ScrapedJob[]> {
  const url = scraper.url;
  if (!url) {
    console.warn(`  Custom scraper "${scraper.name}" has no URL`);
    return [];
  }

  console.log(`  Custom "${scraper.name}": launching browser for ${url}...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // --- Path A: selectors already known from DB or a previous AI run ---
    if (scraper.selectors && Object.keys(scraper.selectors).length > 0) {
      const jobs = await extractWithSelectors(page, scraper);
      console.log(`  Custom "${scraper.name}": found ${jobs.length} jobs via selectors`);
      return jobs;
    }

    // --- Path B: no selectors – use AI to analyse the page ---
    const pageText = await page.evaluate(() => {
      // Grab visible text only, capped to avoid huge payloads
      return (document.body?.innerText ?? "").substring(0, 12000);
    });

    const aiResult = await analyzeWithAI(pageText, scraper.name);

    if (aiResult.selectors && Object.keys(aiResult.selectors).length > 0) {
      // Persist the selectors so future runs skip the AI call
      await updateScraperSelectors(scraper.id, aiResult.selectors).catch((err) =>
        console.warn(`  Failed to save selectors for "${scraper.name}":`, err)
      );
    }

    console.log(
      `  Custom "${scraper.name}": AI found ${aiResult.jobs.length} jobs` +
        (aiResult.selectors ? " (selectors saved)" : "")
    );
    return aiResult.jobs;
  } catch (err) {
    console.warn(`  Custom scraper "${scraper.name}":`, (err as Error).message);
    return [];
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function extractWithSelectors(
  page: any,
  scraper: ScraperRow
): Promise<ScrapedJob[]> {
  const s = scraper.selectors!;

  return page.evaluate(
    (selectors: Record<string, string>, source: string) => {
      const titleEls = document.querySelectorAll(selectors.titleSelector);
      const jobs: any[] = [];

      titleEls.forEach((titleEl: Element) => {
        // Walk up to the nearest common ancestor (card container)
        const card = titleEl.closest(
          selectors.cardSelector || "div,li,article"
        );
        if (!card) return;

        const get = (sel: string) =>
          sel ? card.querySelector(sel)?.textContent?.trim() ?? "" : "";

        const title = titleEl.textContent?.trim() ?? "";
        if (!title) return;

        jobs.push({
          title,
          company: get(selectors.companySelector),
          location: get(selectors.locationSelector),
          url:
            (titleEl as HTMLAnchorElement).href ||
            get(selectors.urlSelector) ||
            "",
          description: get(selectors.descriptionSelector),
          source,
        });
      });

      return jobs;
    },
    { ...s, cardSelector: s.cardSelector || "" },
    scraper.name
  );
}

interface AIExtractResult {
  jobs: ScrapedJob[];
  selectors: Record<string, string> | null;
}

async function analyzeWithAI(
  pageText: string,
  sourceName: string
): Promise<AIExtractResult> {
  const prompt = `You are a web-scraping expert. Below is the visible text of a job-listing page.

Your tasks:
1. Extract every job listing you can identify. For each job return: title, company, location, url (if visible), description (first 300 chars).
2. Suggest CSS selectors that could be used to re-scrape this page automatically without AI next time. The selectors should target elements relative to a job-card container.

Respond with ONLY a JSON object in this exact format:
{
  "jobs": [
    {"title": "...", "company": "...", "location": "...", "url": "...", "description": "..."}
  ],
  "selectors": {
    "cardSelector": ".job-card",
    "titleSelector": ".job-title a",
    "companySelector": ".company-name",
    "locationSelector": ".location",
    "urlSelector": ".job-title a",
    "descriptionSelector": ".description"
  }
}

If you cannot determine reliable selectors, set "selectors" to null.

PAGE TEXT:
${pageText}`;

  const response = await ai.chat.completions.create({
    model: cfg.deepseek.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 4000,
  });

  try {
    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content.trim());

    const jobs: ScrapedJob[] = (parsed.jobs || []).map((j: any) => ({
      title: j.title || "",
      company: j.company || "",
      location: j.location || "",
      url: j.url || "",
      description: (j.description || "").substring(0, 500),
      source: sourceName,
    }));

    return { jobs, selectors: parsed.selectors || null };
  } catch {
    console.warn("  AI selectors: failed to parse response, returning empty");
    return { jobs: [], selectors: null };
  }
}
