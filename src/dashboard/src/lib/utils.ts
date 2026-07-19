import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const now = new Date();
  const d = new Date(dateStr);
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-cyan-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-400';
}

export function scoreBgColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-cyan-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export function sourceBadgeColor(source: string): string {
  switch (source?.toLowerCase()) {
    case 'yc':
    case 'ycombinator':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'linkedin':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    default:
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  }
}

export function statusBadgeColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'new':
      return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    case 'applied':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'skipped':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'not_a_fit':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

export function statusLabel(status: string): string {
  switch (status?.toLowerCase()) {
    case 'new': return 'New';
    case 'applied': return 'Applied';
    case 'skipped': return 'Skipped';
    case 'not_a_fit': return 'Not a Fit';
    default: return status || 'Unknown';
  }
}
