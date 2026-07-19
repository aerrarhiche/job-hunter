import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchScrapers,
  fetchAuditLogs,
  triggerScraper,
  triggerAllScrapers,
  updateScraper,
  fetchStats,
} from '@/lib/api';
import type { AuditLog } from '@/lib/api';
import { timeAgo } from '@/lib/utils';

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Radio,
  Zap,
  Activity,
  Power,
  PowerOff,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export default function ScoutPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [activeRunId, setActiveRunId] = useState<string | null>(null); // run to show logs for
  const logEndRef = useRef<HTMLDivElement>(null);

  const { data: scrapers, isLoading: sLoading } = useQuery({
    queryKey: ['scrapers'],
    queryFn: fetchScrapers,
    refetchInterval: 30000,
  });

  const { data: logs } = useQuery({
    queryKey: ['audit-logs', activeRunId],
    queryFn: () => fetchAuditLogs(activeRunId!),
    enabled: !!activeRunId,
    refetchInterval: activeRunId ? 2000 : false, // poll every 2s when viewing
  });

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs?.length]);

  const triggerAllMut = useMutation({
    mutationFn: triggerAllScrapers,
    onSuccess: (data: any) => {
      toast({ title: 'All scrapers triggered', variant: 'success' });
      setActiveRunId(String(data.runId));
      queryClient.invalidateQueries({ queryKey: ['scrapers'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const handleRun = async (id: string) => {
    setRunningIds((p) => new Set(p).add(id));
    try {
      const data: any = await triggerScraper(id);
      toast({ title: 'Scraper triggered', variant: 'success' });
      setActiveRunId(String(data.runId));
      queryClient.invalidateQueries({ queryKey: ['scrapers'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    } catch {
      toast({ title: 'Failed', variant: 'error' });
    } finally {
      setRunningIds((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  const handleToggle = (id: string, active: boolean) => {
    updateScraper(id, { active }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['scrapers'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    });
  };

  // Check if any scraper in the active run is still running
  const isRunActive = logs && logs.some((l: AuditLog) => l.status === 'running');

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Scout</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Run scrapers and watch live progress.
          </p>
        </div>
        <Button onClick={() => triggerAllMut.mutate()} disabled={triggerAllMut.isPending} className="gap-2">
          {triggerAllMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Run All Scrapers
        </Button>
      </div>

      {/* Scraper cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sLoading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          (scrapers ?? []).map((s: any) => (
            <div
              key={s.id}
              className={`rounded-xl border p-4 flex flex-col gap-3 transition-colors ${
                s.active
                  ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50'
                  : 'border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/20 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Radio className="h-4 w-4 text-cyan-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{s.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono uppercase">{s.type}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle(s.id, !s.active)}
                  className={`p-1 rounded ${s.active ? 'text-green-500' : 'text-slate-400'}`}
                  title={s.active ? 'Deactivate' : 'Activate'}
                >
                  {s.active ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleRun(s.id)}
                  disabled={runningIds.has(s.id) || !s.active}
                  className="gap-1.5 h-8 text-xs"
                >
                  {runningIds.has(s.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  Run Now
                </Button>
                {s.last_run && (
                  <span className="text-[11px] text-slate-400">
                    Last: {timeAgo(s.last_run)}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Live feed */}
      {activeRunId && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900">
            <div className="flex items-center gap-2">
              <Activity className={`h-3.5 w-3.5 ${isRunActive ? 'text-cyan-400 animate-pulse' : 'text-green-400'}`} />
              <span className="text-xs font-mono text-slate-300">Run #{activeRunId}</span>
              {isRunActive && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-900/50 text-cyan-400 animate-pulse">
                  LIVE
                </span>
              )}
            </div>
            <button
              onClick={() => setActiveRunId(null)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          </div>

          {/* Log lines */}
          <div className="p-4 max-h-96 overflow-y-auto font-mono text-xs leading-relaxed space-y-1">
            {!logs || logs.length === 0 ? (
              <p className="text-slate-600 animate-pulse">Waiting for pipeline to start...</p>
            ) : (
              logs.map((log) => (
                <LogLine key={log.id} log={log} />
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Log line component ──────────────────────────────────────────

function LogLine({ log }: { log: AuditLog }) {
  const icon =
    log.status === 'completed' ? (
      <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
    ) : log.status === 'failed' ? (
      <XCircle className="h-3 w-3 text-red-400 shrink-0" />
    ) : (
      <Loader2 className="h-3 w-3 text-cyan-400 animate-spin shrink-0" />
    );

  const color =
    log.status === 'completed'
      ? 'text-green-400'
      : log.status === 'failed'
      ? 'text-red-400'
      : 'text-cyan-400';

  return (
    <div className="flex items-start gap-2">
      {icon}
      <span className="text-slate-500 shrink-0 w-20 text-right font-mono">{fmtTime(log.created_at)}</span>
      <span className="text-slate-600">[{log.step}]</span>
      <span className={color}>{log.message}</span>
    </div>
  );
}
