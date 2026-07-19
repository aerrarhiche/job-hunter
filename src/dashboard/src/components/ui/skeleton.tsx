import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-slate-200 dark:bg-slate-700',
        'after:absolute after:inset-0 after:content-[\'\'] after:-translate-x-full after:animate-[shimmer_1.5s_infinite]',
        'after:bg-gradient-to-r after:from-transparent after:via-slate-300/50 dark:after:via-slate-600/50 after:to-transparent',
        className
      )}
      {...props}
    />
  );
}
