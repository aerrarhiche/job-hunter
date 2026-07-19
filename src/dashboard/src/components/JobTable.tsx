import { Job, JobsResponse } from '@/lib/api';
import {
  cn,
  formatDateShort,
  scoreColor,
  scoreBgColor,
  sourceBadgeColor,
  statusBadgeColor,
  statusLabel,
} from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useResizableColumns, ResizableTh } from '@/lib/useResizableColumns';

const COLUMN_DEFAULTS = {
  title: 220, company: 150, source: 90, score: 100, size: 70, location: 120, date: 90, status: 90, actions: 80,
};
const COLUMN_KEYS = Object.keys(COLUMN_DEFAULTS);

// Sort rank for company size values
const SIZE_RANK: Record<string, number> = {
  '<10': 1, '10-50': 2, '50-200': 3, '200+': 4, 'unknown': 5,
};

interface JobTableProps {
  data: JobsResponse | undefined;
  isLoading: boolean;
  page: number;
  onPageChange: (page: number) => void;
  filters: { source: string; minScore: number; status: string };
  onFiltersChange: (filters: { source: string; minScore: number; status: string }) => void;
  onJobClick: (job: Job) => void;
}

type SortKey = 'title' | 'company' | 'source' | 'score' | 'size' | 'location' | 'date' | 'status' | '';

export default function JobTable({
  data,
  isLoading,
  page,
  onPageChange,
  filters,
  onFiltersChange,
  onJobClick,
}: JobTableProps) {
  const navigate = useNavigate();
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const { widths, startResize, isResizing } = useResizableColumns(COLUMN_KEYS, COLUMN_DEFAULTS);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir(key === 'score' ? 'desc' : 'asc');
    }
  };

  const sortedJobs = useMemo(() => {
    if (!data?.jobs) return [];
    const jobs = [...data.jobs];
    const dir = sortDir === 'asc' ? 1 : -1;

    jobs.sort((a, b) => {
      let va: any, vb: any;
      switch (sortBy) {
        case 'score':
          return ((a.score || 0) - (b.score || 0)) * dir;
        case 'size': {
          va = SIZE_RANK[a.metadata?.companySize || ''] || 6;
          vb = SIZE_RANK[b.metadata?.companySize || ''] || 6;
          return (va - vb) * dir;
        }
        case 'date':
          return (new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()) * dir;
        default: {
          va = ((a as any)[sortBy] || '').toString().toLowerCase();
          vb = ((b as any)[sortBy] || '').toString().toLowerCase();
          return va.localeCompare(vb) * dir;
        }
      }
    });
    return jobs;
  }, [data?.jobs, sortBy, sortDir]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortBy !== column) return <ArrowUpDown className="h-3 w-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 text-cyan-500 ml-1" /> : <ArrowDown className="h-3 w-3 text-cyan-500 ml-1" />;
  };

  const sourceOptions = [
    { value: '', label: 'All Sources' },
    { value: 'yc', label: 'Y Combinator' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'custom', label: 'Custom' },
  ];

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'new', label: 'New' },
    { value: 'applied', label: 'Applied' },
    { value: 'skipped', label: 'Skipped' },
    { value: 'not_a_fit', label: 'Not a Fit' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!data?.jobs?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Search className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
        <h3 className="text-lg font-medium text-slate-600 dark:text-slate-300">No jobs found matching filters</h3>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
          Try adjusting your filters or trigger a scraper run.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-1.5"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </Button>

        {showFilters && (
          <>
            <Select
              value={filters.source}
              onValueChange={(v) => onFiltersChange({ ...filters, source: v })}
              options={sourceOptions}
              placeholder="Source"
              className="w-40"
            />
            <Select
              value={filters.status}
              onValueChange={(v) => onFiltersChange({ ...filters, status: v })}
              options={statusOptions}
              placeholder="Status"
              className="w-40"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Min Score:</span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={filters.minScore}
                onChange={(e) =>
                  onFiltersChange({ ...filters, minScore: Number(e.target.value) })
                }
                className="w-24 accent-cyan-500"
              />
              <span className="text-xs text-cyan-400 font-medium w-8">
                {filters.minScore}
              </span>
            </div>
          </>
        )}

        <div className="ml-auto text-sm text-slate-500">
          {data.total} job{data.total !== 1 ? 's' : ''} found
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed', userSelect: isResizing ? 'none' : undefined }}>
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <ResizableTh width={widths.title} onResizeStart={startResize('title')} className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  <button onClick={() => toggleSort('title')} className="flex items-center group hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Title<SortIcon column="title" /></button>
                </ResizableTh>
                <ResizableTh width={widths.company} onResizeStart={startResize('company')} className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  <button onClick={() => toggleSort('company')} className="flex items-center group hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Company<SortIcon column="company" /></button>
                </ResizableTh>
                <ResizableTh width={widths.source} onResizeStart={startResize('source')} className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  <button onClick={() => toggleSort('source')} className="flex items-center group hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Source<SortIcon column="source" /></button>
                </ResizableTh>
                <ResizableTh width={widths.score} onResizeStart={startResize('score')} className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  <button onClick={() => toggleSort('score')} className="flex items-center group hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Score<SortIcon column="score" /></button>
                </ResizableTh>
                <ResizableTh width={widths.size} onResizeStart={startResize('size')} className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  <button onClick={() => toggleSort('size')} className="flex items-center group hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Size<SortIcon column="size" /></button>
                </ResizableTh>
                <ResizableTh width={widths.location} onResizeStart={startResize('location')} className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  <button onClick={() => toggleSort('location')} className="flex items-center group hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Location<SortIcon column="location" /></button>
                </ResizableTh>
                <ResizableTh width={widths.date} onResizeStart={startResize('date')} className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  <button onClick={() => toggleSort('date')} className="flex items-center group hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Date<SortIcon column="date" /></button>
                </ResizableTh>
                <ResizableTh width={widths.status} onResizeStart={startResize('status')} className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">
                  <button onClick={() => toggleSort('status')} className="flex items-center group hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Status<SortIcon column="status" /></button>
                </ResizableTh>
                <ResizableTh width={widths.actions} onResizeStart={startResize('actions')} className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Actions</ResizableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedJobs.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3" style={{ width: widths.title }}>
                    <span className="font-medium text-slate-800 dark:text-slate-200 line-clamp-1 block">
                      {job.title}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400" style={{ width: widths.company }}>{job.company}</td>
                  <td className="px-4 py-3" style={{ width: widths.source }}>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
                        sourceBadgeColor(job.source)
                      )}
                    >
                      {job.source}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ width: widths.score }}>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', scoreBgColor(job.score))}
                          style={{ width: `${job.score}%` }}
                        />
                      </div>
                      <span className={cn('text-xs font-semibold', scoreColor(job.score))}>
                        {job.score}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ width: widths.size }}>
                    {job.metadata?.companySize ? (
                      <span className={cn(
                        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
                        job.metadata.companySize === '< 10' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                        job.metadata.companySize === '10-50' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' :
                        'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400'
                      )}>
                        {job.metadata.companySize}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 dark:text-slate-500" style={{ width: widths.location }}>{job.location || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 dark:text-slate-500 text-xs" style={{ width: widths.date }}>
                    {formatDateShort(job.scraped_on || job.date)}
                  </td>
                  <td className="px-4 py-3" style={{ width: widths.status }}>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
                        statusBadgeColor(job.status)
                      )}
                    >
                      {statusLabel(job.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ width: widths.actions }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/jobs/${job.id}`);
                      }}
                      className="gap-1"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data.pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-slate-500">
            Page {data.page} of {data.pages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= data.pages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
