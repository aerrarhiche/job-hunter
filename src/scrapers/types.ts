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
  /** Structured data extracted during scraping (stored as JSONB) */
  metadata?: ScrapedJobMetadata | null;
}

export interface ScrapedJobMetadata {
  /** Which scraper flow discovered this job (e.g. "companies_search", "jobs_search") */
  scraperFlow?: string;
  /** YC batch (e.g. "S25", "W25") */
  ycBatch?: string;
  /** Equity range */
  equityMin?: number;
  equityMax?: number;
  /** Employment type tags (e.g. "Full-time", "Contract") */
  employmentType?: string;
  /** Visa sponsorship */
  visaSponsorship?: boolean;
  /** Years of experience required */
  experienceLevel?: string;
  /** Company description / "About the company" section */
  companyDescription?: string;
  /** Role-specific description */
  roleDescription?: string;
  /** Interview process */
  interviewProcess?: string;
  /** Any other tags/attributes */
  tags?: string[];
  /** Company size bucket (populated during scoring) */
  companySize?: string;
}
