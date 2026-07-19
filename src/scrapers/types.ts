export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  source: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  postedDate?: string | null;
}
