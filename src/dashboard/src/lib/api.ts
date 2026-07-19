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
  metadata?: {
    companySize?: string;
    ycBatch?: string;
    scraperFlow?: string;
    equityMin?: number;
    equityMax?: number;
    employmentType?: string;
    visaSponsorship?: boolean;
    experienceLevel?: string;
  };
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

// ─── Scoring Report ───
export interface ScoringReportCategory {
  name: string;
  score: number;
  max: number;
  explanation: string;
}

export interface ScoringReport {
  overall_score: number;
  categories: ScoringReportCategory[];
  summary: string;
}

export async function fetchJobReport(id: number): Promise<ScoringReport> {
  const { data } = await api.get(`/jobs/${id}/report`, { timeout: 60000 });
  return data;
}

// ─── Deep Review ───
export interface DeepReview {
  strengths: string[];
  gaps: string[];
  overall_fit: 'strong' | 'good' | 'maybe' | 'skip';
  recommendation: string;
  key_talking_points: string[];
}

export async function fetchJobReview(id: number): Promise<DeepReview> {
  const { data } = await api.post(`/jobs/${id}/review`, {}, { timeout: 60000 });
  return data;
}

// ─── Cover Letter ───
export interface CoverLetter {
  subject: string;
  body: string;
  tone: string;
}

export async function fetchCoverLetter(id: number): Promise<CoverLetter> {
  const { data } = await api.post(`/jobs/${id}/cover-letter`, {}, { timeout: 60000 });
  return data;
}

// ─── Level Up ───
export interface LevelUpItem {
  id: number;
  skill_name: string;
  category: string | null;
  source_job_ids: number[] | null;
  status: 'to_learn' | 'learning' | 'some_experience' | 'competitor_mastery' | 'mastered';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchLevelUpItems(): Promise<LevelUpItem[]> {
  const { data } = await api.get('/level-up');
  return data;
}

export async function generateLevelUp(): Promise<{ generated: number; items: LevelUpItem[] }> {
  const { data } = await api.post('/level-up/generate', {}, { timeout: 300000 });
  return data;
}

export async function updateLevelUpItem(
  id: number,
  updates: { status?: string; notes?: string }
): Promise<LevelUpItem> {
  const { data } = await api.put(`/level-up/${id}`, updates);
  return data;
}

export interface SkillAnalysis {
  interpretation: string;
  verdict: 'knows_it' | 'learning' | 'knows_competitor' | 'doesnt_know';
  suggested_edits: Array<{
    file: string;
    section: string;
    old: string;
    new: string;
  }>;
  explanation: string;
}

export async function analyzeLevelUpSkill(id: number, userInput: string): Promise<SkillAnalysis> {
  const { data } = await api.post(`/level-up/${id}/analyze`, { userInput }, { timeout: 60000 });
  return data;
}

export async function resolveLevelUpItem(id: number): Promise<void> {
  await api.post(`/level-up/${id}/resolve`);
}

export async function suggestResume(): Promise<{ suggested: string }> {
  const { data } = await api.post('/level-up/suggest-resume', {}, { timeout: 60000 });
  return data;
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
