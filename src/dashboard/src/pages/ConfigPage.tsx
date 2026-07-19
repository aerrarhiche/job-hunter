import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchSearchConfig, updateSearchConfig } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Settings, Save, Loader2 } from 'lucide-react';

export default function ConfigPage() {
  const { toast } = useToast();

  const [roleTitles, setRoleTitles] = useState('');
  const [excludeKeywords, setExcludeKeywords] = useState('');
  const [mustHave, setMustHave] = useState('');
  const [locations, setLocations] = useState('');
  const [minSalary, setMinSalary] = useState(0);
  const [remoteOnly, setRemoteOnly] = useState(true);

  const { data: config, isLoading } = useQuery({
    queryKey: ['search-config'],
    queryFn: fetchSearchConfig,
  });

  useEffect(() => {
    if (config) {
      setRoleTitles(Array.isArray(config.roleTitles) ? config.roleTitles.join('\n') : '');
      setExcludeKeywords(Array.isArray(config.excludeKeywords) ? config.excludeKeywords.join('\n') : '');
      setMustHave(Array.isArray(config.mustHave) ? config.mustHave.join('\n') : '');
      setLocations(Array.isArray(config.locations) ? config.locations.join(', ') : '');
      setMinSalary(config.minSalary || 0);
      setRemoteOnly(config.remoteOnly ?? true);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateSearchConfig({
        roleTitles: roleTitles
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        excludeKeywords: excludeKeywords
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        mustHave: mustHave
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        locations: locations
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        minSalary,
        remoteOnly,
      }),
    onSuccess: () => {
      toast({
        title: 'Configuration saved',
        description: 'Search settings have been updated.',
        variant: 'success',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to save',
        description: 'Please try again.',
        variant: 'error',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="space-y-4 max-w-2xl">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Search Configuration</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Define what jobs the agent should look for.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Role Titles
          </label>
          <textarea
            value={roleTitles}
            onChange={(e) => setRoleTitles(e.target.value)}
            placeholder="Software Engineer&#10;Frontend Developer&#10;Full Stack Engineer"
            rows={5}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 resize-y font-mono"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
            One per line. Job title must match at least one of these.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Must-Have Tech
          </label>
          <textarea
            value={mustHave}
            onChange={(e) => setMustHave(e.target.value)}
            placeholder="typescript&#10;react&#10;python&#10;node.js&#10;aws"
            rows={4}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 resize-y font-mono"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
            OR gate with roles: keep jobs that mention at least one of these techs in the description.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Exclude Keywords
          </label>
          <textarea
            value={excludeKeywords}
            onChange={(e) => setExcludeKeywords(e.target.value)}
            placeholder="crypto&#10;blockchain&#10;solidity&#10;devops"
            rows={4}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 resize-y font-mono"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
            Jobs containing any of these keywords will be filtered out.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Locations
          </label>
          <Input
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            placeholder="United States, Canada, Remote"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
            Comma-separated. Jobs with known locations must match at least one.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Minimum Salary (USD)
          </label>
          <Input
            type="number"
            value={minSalary}
            onChange={(e) => setMinSalary(Number(e.target.value))}
            placeholder="120000"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
            Jobs with known salary below this amount will be filtered out.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="remoteOnly"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-cyan-600 focus:ring-cyan-500"
          />
          <label
            htmlFor="remoteOnly"
            className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            Remote only — filter out on-site / in-office jobs
          </label>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
}
