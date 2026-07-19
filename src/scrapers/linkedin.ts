import axios from "axios";
import type { ScrapedJob } from "./types.js";
import { withRetry } from "../agent/pipeline.js";

const LI_CONCURRENCY = 3;
const LI_PER_ROLE_TIMEOUT = 45000; // 45s max per role

export async function scrapeLinkedIn(runId?: number): Promise<ScrapedJob[]> {
  try {
    const { cfg } = await import("../config.js");
    if (!cfg.apify.token) {
      console.log("Apify token not set.");
      return [];
    }

    const allJobs: ScrapedJob[] = [];

    for (let i = 0; i < cfg.search.roleTitles.length; i += LI_CONCURRENCY) {
      const batch = cfg.search.roleTitles.slice(i, i + LI_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((role) => searchLinkedInRole(role, cfg.apify.token, runId))
      );
      for (const result of results) {
        if (result.status === "fulfilled") allJobs.push(...result.value);
      }
    }

    return allJobs;
  } catch (err) {
    console.warn("LinkedIn scraper:", (err as Error).message);
    return [];
  }
}

async function searchLinkedInRole(
  role: string,
  token: string,
  runId?: number
): Promise<ScrapedJob[]> {
  const step = `li:search:${role}`;
  const log = async (status: string, msg: string) => {
    if (!runId) return;
    try {
      const { insertAuditLog } = await import("../db/client.js");
      await insertAuditLog(runId, step, status, msg);
    } catch { /* non-critical */ }
  };

  await log("running", `Searching "${role}"...`);
  const start = Date.now();

  try {
    const keywords = encodeURIComponent(role);
    const location = encodeURIComponent("United States");
    const url = `https://www.linkedin.com/jobs/search/?keywords=${keywords}&location=${location}&f_WT=2`;

    // Race against a hard timeout so one stuck role doesn't block the batch
    const { data } = await Promise.race([
      withRetry(
        () =>
          axios.post(
            `https://api.apify.com/v2/acts/curious_coder~linkedin-jobs-scraper/run-sync-get-dataset-items?token=${token}`,
            { urls: [url], count: 20, scrapeCompany: false },
            { timeout: 60000 }
          ),
        1,
        2000
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout after 45s")), LI_PER_ROLE_TIMEOUT)
      ),
    ]);

    const jobs = (Array.isArray(data) ? data : []).map((j: any) => ({
      title: j.title || j.jobTitle || "",
      company: j.company || j.companyName || "",
      location: j.location || "",
      url: j.url || j.jobUrl || j.link || "",
      description: j.description || j.jobDescription || "",
      source: "linkedin",
    }));

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  LinkedIn: found ${jobs.length} jobs for "${role}" in ${elapsed}s`);
    await log("completed", `"${role}" → ${jobs.length} jobs (${elapsed}s)`);
    return jobs;
  } catch (e: any) {
    const msg = e.response?.status ? `HTTP ${e.response.status}` : (e as Error).message;
    console.warn(`  LinkedIn "${role}": ${msg}`);
    await log("failed", `"${role}" failed: ${msg}`);
    return [];
  }
}
