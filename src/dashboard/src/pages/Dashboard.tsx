import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchStats,
  fetchScrapers,
  fetchRuns,
  fetchJobs,
  triggerAllScrapers,
  triggerScraper,
  updateScraper,
} from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/utils';
import StatCard from '@/components/StatCard';
import ScraperCard from '@/components/ScraperCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  Briefcase,
  TrendingUp,
  Star,
  CheckCircle2,
  Play,
  Loader2,
  Zap,
  Clock,
  Radio,
} from 'lucide-react';
import { useState } from 'react';

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [runningScrapers, setRunningScrapers] = useState<Set<string>>(new Set());

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 30000,
  });

  const { data: scrapers, isLoading: scrapersLoading } = useQuery({
    queryKey: ['scrapers'],
    queryFn: fetchScrapers,
    refetchInterval: 30000,
  });

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ['runs'],
    queryFn: () => fetchRuns(10),
    refetchInterval: 10000,
  });
  const runs = Array.isArray(runsData) ? runsData : (runsData as any)?.runs || [];

  const { data: recentJobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs', 'recent'],
    queryFn: () => fetchJobs({ limit: 5, page: 1 }),
  });
  const recentJobs = Array.isArray(recentJobsData) ? [] : (recentJobsData as any)?.jobs || [];

  const triggerAllMutation = useMutation({
    mutationFn: triggerAllScrapers,
    onSuccess: () => {
      toast({ title: 'All scrapers triggered', variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: () => toast({ title: 'Failed to trigger scrapers', variant: 'error' }),
  });

  const handleToggle = (id: string, active: boolean) => {
    updateScraper(id, { active }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['scrapers'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast({ title: `Scraper ${active ? 'activated' : 'deactivated'}` });
    });
  };

  const handleRun = async (id: string) => {
    setRunningScrapers((prev) => new Set(prev).add(id));
    try {
      await triggerScraper(id);
      toast({ title: 'Scraper triggered', variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['scrapers'] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    } catch {
      toast({ title: 'Failed to trigger scraper', variant: 'error' });
    } finally {
      setRunningScrapers((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Monitor your job hunting agent at a glance.
          </p>
        </div>
        <Button
          onClick={() => triggerAllMutation.mutate()}
          disabled={triggerAllMutation.isPending}
          className="gap-2"
        >
          {triggerAllMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Trigger All Scrapers
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <StatCard title="Total Jobs" value={stats?.totalJobs ?? 0} icon={Briefcase} />
            <StatCard title="New Today" value={stats?.newToday ?? 0} icon={Zap} />
            <StatCard title="Avg Score" value={stats?.avgScore ? `${Math.round(stats.avgScore)}%` : '0%'} icon={Star} />
            <StatCard title="Applied" value={stats?.applied ?? 0} icon={CheckCircle2} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scrapers */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Scrapers</h3>
          </div>
          {scrapersLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(scrapers ?? []).map((s: any) => (
                <ScraperCard
                  key={s.id}
                  id={s.id}
                  name={s.name}
                  type={s.type}
                  url={s.url}
                  active={s.active}
                  lastRun={s.last_run}
                  lastError={s.last_error}
                  isRunning={runningScrapers.has(s.id)}
                  onToggle={(active) => handleToggle(s.id, active)}
                  onRun={() => handleRun(s.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recent Runs — clickable */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Recent Runs</h3>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden">
            {runsLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {runs.slice(0, 8).map((run: any) => (
                  <div
                    key={run.id}
                    className="px-4 py-3 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {formatDate(run.started_at)}
                        </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {run.new_jobs} new · {run.total_jobs} total
                        {run.yc_jobs > 0 && ` · YC: ${run.yc_jobs}`}
                        {run.linkedin_jobs > 0 && ` · LI: ${run.linkedin_jobs}`}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        run.status === 'completed'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : run.status === 'running'
                          ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400'
                          : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Jobs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Recent Jobs</h3>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden">
          {jobsLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(recentJobs ?? []).map((job: any) => (
                <div key={job.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                      {job.title}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                      {job.company} · {job.location}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {job.source}
                    </span>
                    <span className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                      {job.score}/100
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
