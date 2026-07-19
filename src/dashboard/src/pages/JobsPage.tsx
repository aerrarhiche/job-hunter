import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { fetchJobs, decideJob } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useState } from 'react';
import JobTable from '@/components/JobTable';
import JobDetail from '@/components/JobDetail';

export default function JobsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ source: '', minScore: 0, status: '' });
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['jobs', page, filters],
    queryFn: () => fetchJobs({ page, limit: 20, source: filters.source || undefined, minScore: filters.minScore > 0 ? String(filters.minScore) : undefined, status: filters.status || undefined }),
    placeholderData: keepPreviousData,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Jobs</h2>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>
      <JobTable
        data={data}
        isLoading={isLoading && !isPlaceholderData}
        page={page}
        onPageChange={setPage}
        filters={filters}
        onFiltersChange={setFilters}
        onJobClick={(job) => setSelectedJobId(job.id)}
      />
      {selectedJobId && (
        <JobDetail
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onDecide={() => {
            setSelectedJobId(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
