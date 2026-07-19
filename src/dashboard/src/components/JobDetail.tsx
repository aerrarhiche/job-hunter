import { useState } from 'react';
import { X, Building2, MapPin, Calendar, Target, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Job, fetchJob, decideJob } from '@/lib/api';
import { cn, formatDate, statusLabel } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

interface JobDetailProps {
  jobId: number;
  onClose: () => void;
  onDecide: () => void;
}

export default function JobDetail({ jobId, onClose, onDecide }: JobDetailProps) {
  const { toast } = useToast();
  const { data: detail, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => fetchJob(jobId),
  });

  const handleDecide = async (action: string) => {
    try {
      await decideJob(jobId, action);
      toast({ title: `Job marked as ${statusLabel(action)}` });
      onDecide();
    } catch {
      toast({ title: 'Failed to update job', variant: 'error' });
    }
  };

  const scoreColor = (s: number) =>
    s >= 85 ? 'text-emerald-600 dark:text-emerald-400' : s >= 70 ? 'text-cyan-600 dark:text-cyan-400' : s >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl overflow-y-auto')}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-sm px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Job Details</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {isLoading || !detail ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 leading-tight">{detail.job?.title || detail.title}</h3>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                    <Building2 className="h-3.5 w-3.5" />{detail.job?.company || detail.company}
                  </span>
                  {detail.job?.location && (
                    <span className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                      <MapPin className="h-3.5 w-3.5" />{detail.job.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                    <Calendar className="h-3.5 w-3.5" />{formatDate(detail.job?.scraped_on || detail.scraped_on)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{detail.job?.source || detail.source}</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusLabel(detail.job?.status || detail.status || 'new'))}>{statusLabel(detail.job?.status || 'new')}</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Match Score</span>
                  <span className={cn('text-lg font-bold ml-auto', scoreColor(detail.job?.score || detail.score || 0))}>{detail.job?.score || detail.score}/100</span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{detail.job?.score_reason || detail.score_reason}</p>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Description</h4>
                <div className="prose prose-sm max-w-none text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
                  {detail.job?.description || detail.description || 'No description available.'}
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <a href={detail.job?.url || detail.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" />View on source
                </a>
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 flex gap-2">
          <Button variant="default" className="flex-1 gap-2" onClick={() => handleDecide('applied')}>Mark Applied</Button>
          <Button variant="outline" className="flex-1 gap-2" onClick={() => handleDecide('skipped')}>Skip</Button>
          <Button variant="ghost" className="flex-1 gap-2" onClick={() => handleDecide('not_a_fit')}>Not a Fit</Button>
        </div>
      </div>
    </>
  );
}
