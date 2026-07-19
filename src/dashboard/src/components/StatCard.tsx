import { DivideIcon as LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  isLoading?: boolean;
}

export default function StatCard({ title, value, icon: Icon, isLoading }: StatCardProps) {
  if (isLoading) {
    return <Skeleton className="h-28 rounded-xl" />;
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-5 hover:border-cyan-200 dark:hover:border-cyan-800 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-500 dark:text-slate-400">{title}</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
          <Icon className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}
