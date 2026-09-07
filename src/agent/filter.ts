import type { ScrapedJob } from "../scrapers/types.js";

export interface SearchConfig {
  excludeKeywords: string[];
  mustHave: string[];
  roleTitles: string[];
  locations: string[];
  minSalary: number;
  minScore: number;
  remoteOnly: boolean;
}

/**
 * Remove duplicate listings (by URL) and entries missing a title or company.
 */
export function dedupeJobs(jobs: ScrapedJob[]): ScrapedJob[] {
  const seen = new Set<string>();
  return jobs.filter((j) => {
    if (seen.has(j.url) || !j.title || !j.company) return false;
    seen.add(j.url);
    return true;
  });
}

/**
 * Apply hard, deterministic filters before scoring: keyword blacklist,
 * role/tech match, remote policy, location, and salary floor.
 */
export function filterJobs(jobs: ScrapedJob[], config: SearchConfig): ScrapedJob[] {
  return jobs.filter((j) => {
    const text = `${j.title} ${j.description}`.toLowerCase();
    const titleLower = j.title.toLowerCase();
    const locLower = (j.location || "").toLowerCase();

    if (config.excludeKeywords.some((kw) => text.includes(kw))) return false;

    const matchesRole = config.roleTitles.some((role) => titleLower.includes(role.toLowerCase()));
    const matchesTech = config.mustHave.some((tech) => text.includes(tech));
    if (!matchesRole && !matchesTech) return false;

    if (config.remoteOnly && locLower && locLower !== "unknown") {
      if (/\bon.site\b|\bin.office\b|\bin.person\b/i.test(locLower)) return false;
    }

    if (config.locations.length > 0 && locLower && locLower !== "unknown") {
      const matchesLocation = config.locations.some(
        (l) => locLower.includes(l.toLowerCase()) || l.toLowerCase().includes(locLower)
      );
      if (!matchesLocation) return false;
    }

    if (j.salaryMin != null && config.minSalary > 0 && j.salaryMin < config.minSalary) {
      return false;
    }

    return true;
  });
}
