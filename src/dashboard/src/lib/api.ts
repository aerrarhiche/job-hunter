import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Stats ───
export interface Stats {
  totalJobs: number;
  newToday: number;
  avgScore: number;
  applied: number;
  ycActive: boolean;
  linkedinActive: boolean;
  customActive: boolean;
}

export async function fetchStats(): Promise<Stats> {
  const { data } = await api.get('/stats');
  return {
    totalJobs: data.total || 0,
    newToday: data.new || 0,
    avgScore: data.avgScore || 0,
    applied: data.applied || 0,
    ycActive: data.ycHealthy ?? false,
    linkedinActive: data.linkedinHealthy ?? false,
    customActive: data.customHealthy ?? false,
  };
}

// ─── Jobs ───
export interface Job {
  id: string;
  title: string;
  company: string;
  source: string;
  score: number;
  location: string;
  date: string;
  status: string;
  url?: string;
}

export interface JobDetail extends Job {
  description: string;
  score_reason: string;
}

export interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  pages: number;
}

export interface JobsParams {
  page?: number;
  source?: string;
  minScore?: number;
  status?: string;
  limit?: number;
}

export async function fetchJobs(params: JobsParams = {}): Promise<JobsResponse> {
  const limit = params.limit || 20;
  const offset = params.page ? (params.page - 1) * limit : 0;
  const { data } = await api.get('/jobs', { params: { ...params, offset, limit } });
  // Backend returns { jobs, total, offset, limit }
  const total = data.total || 0;
  const page = params.page || 1;
  const pages = Math.ceil(total / limit);
  return { jobs: data.jobs || [], total, page, pages };
}

export async function fetchJob(id: number): Promise<any> {
  const { data } = await api.get(`/jobs/${id}`);
  return data;
}

export async function decideJob(
  id: string,
  action: 'applied' | 'skipped' | 'not_a_fit'
): Promise<void> {
  await api.post(`/jobs/${id}/decide`, { action });
}

// ─── Scrapers ───
export interface Scraper {
  id: string;
  name: string;
  type: 'yc' | 'linkedin' | 'custom';
  url: string;
  active: boolean;
  last_run: string | null;
  last_error: string | null;
  selectors?: {
    title?: string;
    company?: string;
    location?: string;
    description?: string;
  };
}

export async function fetchScrapers(): Promise<Scraper[]> {
  const { data } = await api.get('/scrapers');
  return data;
}

export async function updateScraper(
  id: string,
  updates: Partial<Pick<Scraper, 'active' | 'selectors'>>
): Promise<Scraper> {
  const { data } = await api.put(`/scrapers/${id}`, updates);
  return data;
}

export async function createScraper(
  body: { name: string; url: string; selectors?: Scraper['selectors'] }
): Promise<Scraper> {
  const { data } = await api.post('/scrapers', body);
  return data;
}

export async function deleteScraper(id: string): Promise<void> {
  await api.delete(`/scrapers/${id}`);
}

export async function triggerScraper(id: string): Promise<{ runId: string }> {
  const { data } = await api.post(`/scrapers/${id}/trigger`);
  return data;
}

export async function triggerAllScrapers(): Promise<{ runId: string }> {
  const { data } = await api.post('/scrapers/trigger-all');
  return data;
}

// ─── Search Config ───
export interface SearchConfig {
  roleTitles: string[];
  excludeKeywords: string[];
  mustHave: string[];
  locations: string[];
  minSalary: number;
  remoteOnly: boolean;
}

export async function fetchSearchConfig(): Promise<SearchConfig> {
  const { data } = await api.get('/search-config');
  return data;
}

export async function updateSearchConfig(config: SearchConfig): Promise<SearchConfig> {
  const { data } = await api.put('/search-config', config);
  return data;
}

// ─── Audit Logs ───
export interface AuditLog {
  id: string;
  scout_run_id: string;
  step: string;
  status: 'running' | 'completed' | 'failed';
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export async function fetchAuditLogs(runId?: string): Promise<AuditLog[]> {
  const params = runId ? { runId } : {};
  const { data } = await api.get('/audit-logs', { params });
  return data;
}

// ─── Runs ───
export interface Run {
  id: string;
  date: string;
  time?: string;
  totalJobs: number;
  newJobs: number;
  ycJobs: number;
  linkedinJobs: number;
  customJobs: number;
  status: string;
}

export interface RunsResponse {
  runs: Run[];
  total?: number;
  page?: number;
  pages?: number;
}

export async function fetchRuns(limit = 20, page = 1): Promise<RunsResponse> {
  const { data } = await api.get('/runs', { params: { limit, page } });
  // Normalize response shape
  if (Array.isArray(data)) return { runs: data };
  return data;
}
