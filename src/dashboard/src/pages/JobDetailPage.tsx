import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJob, fetchJobReport, fetchJobReview, fetchCoverLetter, decideJob, ScoringReportCategory, DeepReview, CoverLetter } from '@/lib/api';
import { cn, formatDate, statusLabel } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Calendar,
  Target,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Sparkles,
  Loader2,
  Tag,
  Coins,
  Briefcase,
  Globe,
  Clock,
  Search,
  FileText,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Minus,
  MessageSquare,
} from 'lucide-react';
import { useState } from 'react';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const jobId = parseInt(id || '0', 10);

  const { data: detail, isLoading: jobLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => fetchJob(jobId),
    enabled: !!jobId,
  });

  const job = detail?.job || detail;
  const meta = (job?.metadata || detail?.metadata) as Record<string, any> | undefined;

  // Report is stored in DB from scoring time — read it directly (instant)
  const storedReport = (job?.scoring_report || detail?.scoring_report) as any;

  // Legacy fallback: only call the report API if not stored (old jobs)
  const { data: apiReport, isLoading: reportLoading, isError: reportError } = useQuery({
    queryKey: ['job-report', jobId],
    queryFn: () => fetchJobReport(jobId),
    enabled: !!jobId && !storedReport && !!job,
  });

  const report = storedReport || apiReport;

  const handleDecide = async (action: 'applied' | 'skipped' | 'not_a_fit') => {
    try {
      await decideJob(String(jobId), action);
      toast({ title: `Job marked as ${statusLabel(action)}` });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    } catch {
      toast({ title: 'Failed to update job', variant: 'error' });
    }
  };

  // ── Review state ────────────────────────────────────────────
  const [review, setReview] = useState<DeepReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState(false);

  const handleReview = async () => {
    setReviewLoading(true);
    setReviewError(false);
    setReview(null);
    try {
      const r = await fetchJobReview(jobId);
      setReview(r);
    } catch {
      setReviewError(true);
    } finally {
      setReviewLoading(false);
    }
  };

  // ── Cover letter state ──────────────────────────────────────
  const [coverLetter, setCoverLetter] = useState<CoverLetter | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverError, setCoverError] = useState(false);

  const handleCoverLetter = async () => {
    setCoverLoading(true);
    setCoverError(false);
    setCoverLetter(null);
    try {
      const c = await fetchCoverLetter(jobId);
      setCoverLetter(c);
    } catch {
      setCoverError(true);
    } finally {
      setCoverLoading(false);
    }
  };

  const scoreColor = (s: number) =>
    s >= 85
      ? 'text-emerald-600 dark:text-emerald-400'
      : s >= 70
        ? 'text-cyan-600 dark:text-cyan-400'
        : s >= 50
          ? 'text-yellow-600 dark:text-yellow-400'
          : 'text-red-600 dark:text-red-400';

  const categoryBarColor = (score: number, max: number) => {
    const pct = score / max;
    if (pct >= 0.8) return 'bg-emerald-500';
    if (pct >= 0.6) return 'bg-cyan-500';
    if (pct >= 0.4) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (jobLoading || !job) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-96" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Back button */}
      <Link
        to="/jobs"
        className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to jobs
      </Link>

      {/* ── Job Header ── */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-tight">
              {job.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />
                <span className="font-medium text-slate-700 dark:text-slate-300">{job.company}</span>
              </span>
              {job.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {job.location}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {formatDate(job.scraped_on || job.date)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                {job.source}
              </span>
              <span
                className={cn(
                  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium',
                  job.status === 'applied'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : job.status === 'skipped'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : job.status === 'not_a_fit'
                        ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                        : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                )}
              >
                {statusLabel(job.status || 'new')}
              </span>
              {job.salary_min != null && (
                <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  ${(job.salary_min / 1000).toFixed(0)}K{job.salary_max != null ? ` – $${(job.salary_max / 1000).toFixed(0)}K` : '+'}
                </span>
              )}
              {meta?.equityMin != null && (
                <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-600 dark:text-purple-400">
                  <Coins className="h-3 w-3" />
                  {meta.equityMin}{meta.equityMax != null ? `–${meta.equityMax}` : ''}%
                </span>
              )}
              {meta?.ycBatch && (
                <span className="inline-flex items-center gap-1 rounded-md border border-orange-500/30 bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-600 dark:text-orange-400">
                  <Tag className="h-3 w-3" />
                  YC {meta.ycBatch}
                </span>
              )}
              {meta?.employmentType && (
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-500/30 bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <Briefcase className="h-3 w-3" />
                  {meta.employmentType}
                </span>
              )}
              {meta?.visaSponsorship && (
                <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                  <Globe className="h-3 w-3" />
                  Visa Sponsor
                </span>
              )}
              {meta?.experienceLevel && (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <Clock className="h-3 w-3" />
                  {meta.experienceLevel}
                </span>
              )}
              {meta?.scraperFlow && (
                <span className="inline-flex items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  <Search className="h-3 w-3" />
                  {meta.scraperFlow === 'companies_search' ? 'Flow A' : meta.scraperFlow === 'jobs_search' ? 'Flow B' : meta.scraperFlow}
                </span>
              )}
            </div>
          </div>

          {/* Overall score badge */}
          <div className="flex-shrink-0 flex flex-col items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-5 min-w-[100px]">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">
              Score
            </span>
            <span className={cn('text-4xl font-bold', scoreColor(job.score || report?.overall_score || 0))}>
              {job.score || report?.overall_score || '—'}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">/ 100</span>
          </div>
        </div>

        {/* External link */}
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View original listing
          </a>
        )}
      </div>

      {/* ── Action Buttons ── */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => handleDecide('applied')} className="gap-2">
          <CheckCircle className="h-4 w-4" /> Mark Applied
        </Button>
        <Button variant="outline" onClick={() => handleDecide('skipped')} className="gap-2">
          Skip
        </Button>
        <Button variant="ghost" onClick={() => handleDecide('not_a_fit')} className="gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
          <XCircle className="h-4 w-4" /> Not a Fit
        </Button>
        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 self-center" />
        <Button
          variant="outline"
          onClick={handleReview}
          disabled={reviewLoading}
          className="gap-2 border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950"
        >
          {reviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Resume-Weighted Review
        </Button>
        <Button
          variant="outline"
          onClick={handleCoverLetter}
          disabled={coverLoading}
          className="gap-2 border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950"
        >
          {coverLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Generate Cover Letter
        </Button>
      </div>

      {/* ── Review Result ── */}
      {review && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
            <Eye className="h-5 w-5 text-purple-500" />
            Resume-Weighted Review
          </h2>
          <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-900 overflow-hidden">
            {/* Overall fit */}
            <div className="px-5 py-3 border-b border-purple-100 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 flex items-center gap-2">
              {review.overall_fit === 'strong' ? <ThumbsUp className="h-4 w-4 text-emerald-500" /> :
               review.overall_fit === 'good' ? <ThumbsUp className="h-4 w-4 text-cyan-500" /> :
               review.overall_fit === 'maybe' ? <Minus className="h-4 w-4 text-yellow-500" /> :
               <ThumbsDown className="h-4 w-4 text-red-500" />}
              <span className="text-sm font-semibold capitalize" style={{
                color: review.overall_fit === 'strong' ? '#059669' :
                       review.overall_fit === 'good' ? '#0891b2' :
                       review.overall_fit === 'maybe' ? '#ca8a04' : '#dc2626'
              }}>
                {review.overall_fit}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">overall fit</span>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{review.recommendation}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2">Strengths</h4>
                  <ul className="space-y-1.5">
                    {review.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-2">Gaps</h4>
                  <ul className="space-y-1.5">
                    {review.gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">Key Talking Points</h4>
                <ul className="space-y-1.5">
                  {review.key_talking_points.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <MessageSquare className="h-3.5 w-3.5 text-purple-500 mt-0.5 shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}
      {reviewError && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">Failed to generate review. Try again.</p>
        </div>
      )}

      {/* ── Cover Letter Result ── */}
      {coverLetter && (
        <section>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-500" />
            Cover Letter
            <span className="text-xs font-normal text-slate-400 ml-2">{coverLetter.tone} tone</span>
          </h2>
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-3 border-b border-amber-100 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">Subject: {coverLetter.subject}</span>
            </div>
            <div className="p-5">
              <div className="prose prose-sm max-w-none text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                {coverLetter.body}
              </div>
            </div>
          </div>
        </section>
      )}
      {coverError && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">Failed to generate cover letter. Try again.</p>
        </div>
      )}

      {/* ── Description ── */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">Job Description</h2>

        {/* Structured metadata sections (from scraper) */}
        {meta?.companyDescription && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 mb-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              About {job.company}
            </h3>
            <div className="prose prose-sm max-w-none text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
              {meta.companyDescription}
            </div>
          </div>
        )}
        {meta?.roleDescription && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 mb-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              About the Role
            </h3>
            <div className="prose prose-sm max-w-none text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
              {meta.roleDescription}
            </div>
          </div>
        )}
        {meta?.interviewProcess && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 mb-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Interview Process
            </h3>
            <div className="prose prose-sm max-w-none text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
              {meta.interviewProcess}
            </div>
          </div>
        )}

        {/* Flat description (fallback or for non-YC jobs) */}
        {(!meta?.roleDescription || job.source !== 'yc') && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="prose prose-sm max-w-none text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
              {job.description || 'No description available.'}
            </div>
          </div>
        )}
      </section>

      {/* ── DeepSeek Scoring Report ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            DeepSeek Scoring Report
            {storedReport && <span className="ml-2 text-xs font-normal text-emerald-500">(pre-generated)</span>}
          </h2>
        </div>

        {!report ? (reportLoading ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 text-purple-500 animate-spin" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Generating detailed scoring report with DeepSeek…</p>
          </div>
        ) : (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-5 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Failed to generate scoring report</p>
              <p className="text-xs text-red-500 dark:text-red-500 mt-0.5">The DeepSeek API may be unavailable. Try refreshing the page.</p>
            </div>
          </div>
        )) : (
          <div className="space-y-5">
            {/* Category breakdown */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Category-by-Category Breakdown</span>
                  <span className="ml-auto text-sm font-bold text-slate-500 dark:text-slate-400">
                    Total: {report.overall_score}/100
                  </span>
                </div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(report.categories || []).map((cat: ScoringReportCategory) => (
                  <div key={cat.name} className="px-5 py-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {cat.name}
                      </span>
                      <span className={cn('text-sm font-bold', scoreColor(cat.score / cat.max * 100))}>
                        {cat.score}/{cat.max}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', categoryBarColor(cat.score, cat.max))}
                        style={{ width: `${Math.max(2, (cat.score / cat.max) * 100)}%` }}
                      />
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      {cat.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary verdict */}
            <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20 p-5">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-purple-800 dark:text-purple-300 mb-1">
                    AI Verdict
                  </h3>
                  <p className="text-sm text-purple-700 dark:text-purple-400 leading-relaxed">
                    {report.summary}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Bottom actions ── */}
      <div className="flex gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
        <Button onClick={() => handleDecide('applied')} className="gap-2">
          <CheckCircle className="h-4 w-4" /> Mark Applied
        </Button>
        <Button variant="outline" onClick={() => handleDecide('skipped')} className="gap-2">
          Skip
        </Button>
        <Button variant="ghost" onClick={() => handleDecide('not_a_fit')} className="gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
          <XCircle className="h-4 w-4" /> Not a Fit
        </Button>

        <div className="ml-auto">
          <Link to="/jobs">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back to Jobs
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
