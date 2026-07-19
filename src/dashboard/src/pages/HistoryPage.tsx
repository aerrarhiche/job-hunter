import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRuns } from '@/lib/api';
import { cn, formatDate, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { History, ChevronLeft, ChevronRight, Clock, ChevronDown, ChevronRight as ChevronRightIcon, Zap } from 'lucide-react';

export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['runs', page],
    queryFn: () => fetchRuns(limit, page),
  });

  const runsData = (data as any)?.runs || (Array.isArray(data) ? data : []);
  const runs = runsData;
  const total = (data as any)?.total ?? runs.length;
  const pages = (data as any)?.pages ?? Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Scout Run History</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Track when and what each scraper run discovered.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : runs.length > 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Time</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Total</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">New</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">YC</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">LinkedIn</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Custom</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {runs.map((run: any, i: number) => {
                  const isExpanded = expandedRun === (run.id || i);
                  const startDate = run.started_at ? new Date(run.started_at) : null;
                  const endDate = run.completed_at ? new Date(run.completed_at) : null;
                  const duration = startDate && endDate ? Math.round((endDate.getTime() - startDate.getTime()) / 1000) : null;
                  
                  return (<>
                  <tr
                    key={run.id || i}
                    onClick={() => setExpandedRun(isExpanded ? null : (run.id || i))}
                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRightIcon className="h-3.5 w-3.5 text-slate-400" />}
                        <span className="text-slate-700 dark:text-slate-300">{startDate ? formatDate(run.started_at) : '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 dark:text-slate-500 text-xs">
                      {startDate ? startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">{run.total_jobs || 0}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn('font-medium', (run.new_jobs) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500')}>
                        {(run.new_jobs) > 0 ? `+${run.new_jobs}` : '0'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{run.yc_jobs ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{run.linkedin_jobs ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">{run.custom_jobs ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
                        run.status === 'completed'
                          ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30'
                          : 'bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-500/30'
                      )}>
                        {run.status || 'completed'}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`exp-${run.id || i}`} className="bg-slate-50/50 dark:bg-slate-900/30">
                      <td colSpan={8} className="px-6 py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-slate-400 dark:text-slate-500 text-xs">Duration</span>
                            <p className="text-slate-700 dark:text-slate-300 font-medium">{duration ? `${duration}s` : '—'}</p>
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500 text-xs">Started</span>
                            <p className="text-slate-700 dark:text-slate-300 font-medium">{startDate?.toISOString() || '—'}</p>
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500 text-xs">Completed</span>
                            <p className="text-slate-700 dark:text-slate-300 font-medium">{endDate?.toISOString() || '—'}</p>
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500 text-xs">Sources</span>
                            <p className="text-slate-700 dark:text-slate-300 font-medium">
                              {[run.yc_jobs > 0 && 'YC', run.linkedin_jobs > 0 && 'LinkedIn', run.custom_jobs > 0 && 'Custom'].filter(Boolean).join(', ') || 'None'}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </>);
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Clock className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-600 dark:text-slate-300">No run history</h3>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Trigger a scraper to start collecting history.</p>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">Page {page} of {pages}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pages}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
