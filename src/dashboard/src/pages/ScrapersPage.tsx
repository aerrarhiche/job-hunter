import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchScrapers,
  updateScraper,
  createScraper,
  triggerScraper,
} from '@/lib/api';
import ScraperCard from '@/components/ScraperCard';
import ScraperDialog from '@/components/ScraperDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Plus, Radio } from 'lucide-react';

export default function ScrapersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [runningScrapers, setRunningScrapers] = useState<Set<string>>(new Set());

  const { data: scrapersData, isLoading } = useQuery({
    queryKey: ['scrapers'],
    queryFn: fetchScrapers,
  });
  const scrapers = Array.isArray(scrapersData) ? scrapersData : (scrapersData as any)?.scrapers || [];

  const createMutation = useMutation({
    mutationFn: createScraper,
    onSuccess: () => {
      toast({ title: 'Scraper added successfully', variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['scrapers'] });
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: 'Failed to add scraper', variant: 'error' });
    },
  });

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await updateScraper(id, { active });
      queryClient.invalidateQueries({ queryKey: ['scrapers'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      toast({ title: `Scraper ${active ? 'activated' : 'deactivated'}` });
    } catch {
      toast({ title: 'Failed to update scraper', variant: 'error' });
    }
  };

  const handleRun = async (id: string) => {
    setRunningScrapers((prev) => new Set(prev).add(id));
    try {
      await triggerScraper(id);
      toast({ title: 'Scraper triggered', variant: 'success' });
      queryClient.invalidateQueries({ queryKey: ['scrapers'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['runs'] });
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
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Scrapers</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your job sources and custom scrapers.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Custom Scraper
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))
          : scrapers.map((s: any) => (
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

      {!isLoading && scrapers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Radio className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-600 dark:text-slate-300">No scrapers configured</h3>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Add a custom scraper to start collecting jobs.
          </p>
          <Button
            variant="outline"
            onClick={() => setDialogOpen(true)}
            className="mt-4 gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Custom Scraper
          </Button>
        </div>
      )}

      <ScraperDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
      />
    </div>
  );
}
