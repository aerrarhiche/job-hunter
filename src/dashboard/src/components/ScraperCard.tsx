import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Play, Loader2, Globe, Linkedin, Bot } from 'lucide-react';
import { typeToIcon, timeAgo } from '@/lib/utils';

interface ScraperCardProps {
  id: string;
  name: string;
  type: string;
  url: string;
  active: boolean;
  lastRun: string | null;
  lastError: string | null;
  isRunning: boolean;
  onToggle: (active: boolean) => void;
  onRun: () => void;
}

const typeIcon: Record<string, typeof Globe> = {
  yc: Globe,
  linkedin: Linkedin,
  custom: Bot,
};

const typeLabel: Record<string, string> = {
  yc: 'YC',
  linkedin: 'LinkedIn',
  custom: 'Custom',
};

export default function ScraperCard({ id, name, type, url, active, lastRun, lastError, isRunning, onToggle, onRun }: ScraperCardProps) {
  const Icon = typeIcon[type] || Bot;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
            <Icon className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{name}</h4>
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              {typeLabel[type] || type}
            </span>
          </div>
        </div>
        <Switch checked={active} onCheckedChange={onToggle} />
      </div>
      {lastRun && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Last run: {timeAgo(lastRun)}
        </p>
      )}
      {lastError && (
        <p className="text-xs text-red-500 dark:text-red-400 truncate">{lastError}</p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        onClick={onRun}
        disabled={isRunning}
      >
        {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        {isRunning ? 'Running...' : 'Run Now'}
      </Button>
    </div>
  );
}
