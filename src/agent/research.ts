import axios from "axios";
import * as cheerio from "cheerio";

/** Global circuit-breaker: after N companies fail, skip all research for this run */
let globalFailures = 0;
const GLOBAL_CIRCUIT_BREAKER = 3;

export function resetResearchCircuitBreaker() {
  globalFailures = 0;
}

export interface CompanyResearch {
  company: string;
  snippets: string[];
  searchedAt: string;
}

/**
 * Search the web for company context to enrich LLM scoring.
 * Uses DuckDuckGo's HTML search (no API key required).
 */
export async function researchCompany(
  company: string,
  jobTitle?: string
): Promise<CompanyResearch> {
  // Global circuit-breaker: if DDG is consistently unreachable, skip all research
  if (globalFailures >= GLOBAL_CIRCUIT_BREAKER) {
    return { company, snippets: [], searchedAt: new Date().toISOString() };
  }
  const queries = [
    `${company} company funding series stage`,
    `${company} company size employees`,
    `${company} reviews glassdoor`,
    jobTitle ? `${company} ${jobTitle} job` : null,
  ].filter(Boolean) as string[];

  const allSnippets: string[] = [];
  const seen = new Set<string>();
  let consecutiveFailures = 0;

  for (const query of queries) {
    // Circuit breaker: if first 2 queries fail, skip the rest
    if (consecutiveFailures >= 2) {
      console.warn(`  [research] Skipping remaining queries for ${company} (DDG unreachable)`);
      break;
    }

    try {
      const snippets = await searchDuckDuckGo(query);
      consecutiveFailures = 0;
      for (const s of snippets) {
        const normalized = s.toLowerCase().trim();
        if (!seen.has(normalized) && normalized.length > 30) {
          seen.add(normalized);
          allSnippets.push(s);
        }
      }
    } catch (err) {
      consecutiveFailures++;
      console.warn(`  [research] query "${query}" failed: ${(err as Error).message}`);
    }
  }

  // If no snippets found for this company, count as a failure
  if (allSnippets.length === 0) {
    globalFailures++;
    if (globalFailures >= GLOBAL_CIRCUIT_BREAKER) {
      console.warn(`  [research] DDG unreachable for ${GLOBAL_CIRCUIT_BREAKER} companies — disabling research for rest of run`);
    }
  }

  return {
    company,
    snippets: allSnippets.slice(0, 12),
    searchedAt: new Date().toISOString(),
  };
}

/**
 * Scrape DuckDuckGo HTML search results.
 * Falls back to empty array if DuckDuckGo blocks or changes layout.
 */
async function searchDuckDuckGo(query: string): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const { data } = await axios.get(url, {
    timeout: 3000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
  });

  const $ = cheerio.load(data);
  const snippets: string[] = [];

  // DuckDuckGo HTML results are in .result__snippet elements
  $(".result__snippet").each((_, el) => {
    const text = $(el).text().trim();
    if (text) snippets.push(text);
  });

  // Also grab result titles/links for context
  $(".result__title").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 10) snippets.push(text);
  });

  return snippets;
}

/**
 * Format research results into a concise text block for prompt inclusion.
 */
export function formatResearchForPrompt(research: CompanyResearch): string {
  if (research.snippets.length === 0) {
    return `No web search results found for "${research.company}".`;
  }

  const lines = research.snippets.map(
    (s, i) => `  [${i + 1}] ${s}`
  );

  return `Web search results for "${research.company}":\n${lines.join("\n")}`;
}
