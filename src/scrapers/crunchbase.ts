import axios from "axios";

export async function checkTechCrunchFunding(): Promise<{ company: string; url: string; funding: string }[]> {
  try {
    // TechCrunch funding RSS as a proxy for Crunchbase
    const { data } = await axios.get("https://techcrunch.com/category/venture/feed/", {
      timeout: 10000,
    });
    // Parse RSS for company names that raised rounds recently
    const companies: { company: string; url: string; funding: string }[] = [];
    const regex = /<title>(.+?)<\/title>[\s\S]*?<link>(.+?)<\/link>/g;
    let match;
    while ((match = regex.exec(data)) !== null) {
      const title = match[1];
      const url = match[2];
      if (/raises?\s+\$[\d.]+[MB]/.test(title)) {
        const company = title.split(" raises")[0].trim();
        companies.push({ company, url, funding: title });
      }
    }
    return companies.slice(0, 10);
  } catch (err) {
    console.warn("TechCrunch scraper failed:", (err as Error).message);
    return [];
  }
}
