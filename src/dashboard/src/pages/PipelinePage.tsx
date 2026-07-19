import { useQuery } from '@tanstack/react-query';
import { fetchRuns, fetchAuditLogs } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2,
  Loader2,
  XCircle,
  Activity,
  ChevronDown,
  ChevronRight,
  GitBranch,
} from 'lucide-react';
import { useState } from 'react';

export default function PipelinePage() {
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ['runs', 'all'],
    queryFn: () => fetchRuns(20),
    refetchInterval: 10000,
  });
  const runs = Array.isArray(runsData) ? runsData : (runsData as any)?.runs || [];

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['audit-logs', expandedRun],
    queryFn: () => fetchAuditLogs(expandedRun!),
    enabled: !!expandedRun,
    refetchInterval: expandedRun ? 5000 : false,
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Pipeline</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Step-by-step audit trail for each scout run.
        </p>
      </div>

      <div className="space-y-4">
        {runsLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))
        ) : runs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-8 text-center">
            <GitBranch className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No pipeline runs yet.</p>
            <p className="text-xs text-slate-400 mt-1">Trigger scrapers from the Dashboard to get started.</p>
          </div>
        ) : (
          runs.map((run: any) => {
            const runId = String(run.id);
            const isExpanded = expandedRun === runId;
            const isRunning = run.status === 'running';

            return (
              <div
                key={runId}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden"
              >
                {/* Run header — clickable */}
                <button
                  onClick={() => setExpandedRun(isExpanded ? null : runId)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {formatDate(run.started_at)}
                        </span>
                        {isRunning && (
                          <Activity className="h-3.5 w-3.5 text-cyan-500 animate-pulse" />
                        )}
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {run.new_jobs} new · {run.total_jobs} total
                        {run.yc_jobs > 0 && ` · YC: ${run.yc_jobs}`}
                        {run.linkedin_jobs > 0 && ` · LI: ${run.linkedin_jobs}`}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      run.status === 'completed'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : run.status === 'running'
                        ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 animate-pulse'
                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    }`}
                  >
                    {run.status}
                  </span>
                </button>

                {/* Expanded: pipeline steps */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4 bg-slate-50/50 dark:bg-slate-900/30">
                    {logsLoading ? (
                      <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Skeleton key={i} className="h-6 w-full" />
                        ))}
                      </div>
                    ) : !logs || logs.length === 0 ? (
                      <p className="text-xs text-slate-400">No step data available.</p>
                    ) : (
                      <div className="space-y-0">
                        {logs.map((log, i) => {
                          const isLast = i === logs.length - 1;
                          const isCurrent = log.status === 'running';

                          return (
                            <div key={log.id} className="flex items-start gap-3">
                              <div className="flex flex-col items-center pt-1">
                                {log.status === 'completed' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                ) : log.status === 'failed' ? (
                                  <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                ) : (
                                  <Loader2 className="h-3.5 w-3.5 text-cyan-500 animate-spin shrink-0" />
                                )}
                                {!isLast && (
                                  <div
                                    className={`w-px h-8 ${
                                      log.status === 'completed'
                                        ? 'bg-green-200 dark:bg-green-800'
                                        : 'bg-slate-200 dark:bg-slate-700'
                                    }`}
                                  />
                                )}
                              </div>

                              <div className="min-w-0 flex-1 pb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400">
                                    {log.step}
                                  </span>
                                  {isCurrent && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 animate-pulse">
                                      running
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                                  {log.message}
                                </p>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                  {timeAgo(log.created_at)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
