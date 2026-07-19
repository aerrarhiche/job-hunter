import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchLevelUpItems, generateLevelUp, updateLevelUpItem, suggestResume, LevelUpItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useState } from 'react';
import {
  Sparkles,
  Loader2,
  GraduationCap,
  BookOpen,
  CheckCircle2,
  Target,
  Zap,
  FileText,
  X,
  ArrowUpRight,
} from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'to_learn', label: "Don't know it", color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800' },
  { value: 'learning', label: 'Learning', color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  { value: 'some_experience', label: 'Some experience', color: 'text-cyan-500', bg: 'bg-cyan-100 dark:bg-cyan-900/30' },
  { value: 'competitor_mastery', label: 'Master a competitor', color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  { value: 'mastered', label: 'Mastered', color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
];

const CATEGORY_COLORS: Record<string, string> = {
  framework: 'border-l-blue-500',
  language: 'border-l-amber-500',
  tool: 'border-l-purple-500',
  cloud: 'border-l-cyan-500',
  concept: 'border-l-slate-500',
};

export default function LevelUpPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<LevelUpItem | null>(null);
  const [suggestedResume, setSuggestedResume] = useState<string | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ['level-up'],
    queryFn: fetchLevelUpItems,
  });

  const generateMut = useMutation({
    mutationFn: generateLevelUp,
    onSuccess: (data) => {
      toast({ title: `Generated ${data.generated} skill items from ${data.items.length} reviews` });
      queryClient.invalidateQueries({ queryKey: ['level-up'] });
    },
    onError: () => toast({ title: 'Generation failed', variant: 'error' }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: { status?: string; notes?: string } }) =>
      updateLevelUpItem(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['level-up'] });
      toast({ title: 'Updated' });
    },
  });

  const suggestMut = useMutation({
    mutationFn: suggestResume,
    onSuccess: (data) => {
      setSuggestedResume(data.suggested);
    },
    onError: () => toast({ title: 'Failed to generate resume suggestion', variant: 'error' }),
  });

  const masteredCount = items?.filter((i) => i.status === 'mastered').length ?? 0;
  const toLearnCount = items?.filter((i) => i.status === 'to_learn').length ?? 0;
  const totalCount = items?.length ?? 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-purple-500" />
            Level Up
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Skills to learn from job gap analysis. Update your status to improve your resume.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => suggestMut.mutate()}
            disabled={suggestMut.isPending || totalCount === 0}
            className="gap-2"
          >
            {suggestMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Suggest Resume Update
          </Button>
          <Button
            onClick={() => generateMut.mutate()}
            disabled={generateMut.isPending}
            className="gap-2"
          >
            {generateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate from Jobs
          </Button>
        </div>
      </div>

      {/* Stats */}
      {totalCount > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 text-center">
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">{totalCount}</p>
            <p className="text-xs text-slate-500">Total skills</p>
          </div>
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{masteredCount}</p>
            <p className="text-xs text-emerald-500">Mastered</p>
          </div>
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{toLearnCount}</p>
            <p className="text-xs text-amber-500">To learn</p>
          </div>
        </div>
      )}

      {/* Suggested Resume */}
      {suggestedResume && (
        <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-purple-100 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30">
            <span className="text-sm font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Suggested Resume Update
            </span>
            <button onClick={() => setSuggestedResume(null)} className="text-purple-400 hover:text-purple-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-5">
            <pre className="text-xs text-slate-600 dark:text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">
              {suggestedResume}
            </pre>
          </div>
        </div>
      )}

      {/* Skills List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : !items || items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-12 text-center">
          <Target className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-600 dark:text-slate-300">No skills tracked yet</h3>
          <p className="text-sm text-slate-400 mt-1">
            Click "Generate from Jobs" to analyze all job reviews and extract skill gaps.
          </p>
          <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending} className="mt-4 gap-2">
            {generateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Generate from Jobs
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const status = STATUS_OPTIONS.find((s) => s.value === item.status) || STATUS_OPTIONS[0];
            const catColor = CATEGORY_COLORS[item.category || 'concept'] || CATEGORY_COLORS.concept;

            return (
              <div
                key={item.id}
                className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 border-l-4 ${catColor} overflow-hidden transition-all hover:shadow-sm`}
              >
                <div className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {item.skill_name}
                      </span>
                      <span className="text-[10px] uppercase text-slate-400 font-mono">
                        {item.category}
                      </span>
                      {item.source_job_ids && (
                        <span className="text-[10px] text-slate-400">
                          from {item.source_job_ids.length} job{item.source_job_ids.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {item.notes && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{item.notes}</p>
                    )}
                  </div>
                  <select
                    value={item.status}
                    onChange={(e) => updateMut.mutate({ id: item.id, updates: { status: e.target.value } })}
                    className={`text-xs font-medium rounded-md border-0 px-2 py-1 cursor-pointer ${status.bg} ${status.color} appearance-none text-center min-w-[120px]`}
                    style={{ backgroundImage: 'none' }}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
