import axios from "axios";
import { logger } from "../logger.js";

export interface FundingRound {
  company: string;
  url: string;
  funding: string;
}

/**
 * Parse a TechCrunch RSS feed and extract recent funding-round headlines.
 * Pure function (separated from the network call for testability).
 */
export function parseFundingRss(xml: string): FundingRound[] {
  const companies: FundingRound[] = [];
  const regex = /<title>(.+?)<\/title>[\s\S]*?<link>(.+?)<\/link>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    const title = match[1];
    const url = match[2];
    if (/raises?\s+\$[\d.]+[MB]/.test(title)) {
      const company = title.split(" raises")[0].trim();
      companies.push({ company, url, funding: title });
    }
  }

  return companies.slice(0, 10);
}

export async function checkTechCrunchFunding(): Promise<FundingRound[]> {
  try {
    const { data } = await axios.get("https://techcrunch.com/category/venture/feed/", {
      timeout: 10000,
    });
    return parseFundingRss(data);
  } catch (err) {
    logger.warn({ err }, "TechCrunch scraper failed");
    return [];
  }
}
