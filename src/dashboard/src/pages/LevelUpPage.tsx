import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchLevelUpItems, generateLevelUp, analyzeLevelUpSkill,
  resolveLevelUpItem, suggestResume, LevelUpItem, SkillAnalysis
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useState, useMemo } from 'react';
import {
  Sparkles, Loader2, GraduationCap, Target, Zap,
  FileText, X, Send, CheckCircle2,
  MessageSquare, GitCommit, Eye, EyeOff,
  Code2, Box, Wrench, Cloud, Lightbulb,
} from 'lucide-react';

const CATEGORIES = [
  { key: 'all', label: 'All', icon: Target },
  { key: 'framework', label: 'Framework', icon: Code2 },
  { key: 'language', label: 'Language', icon: Code2 },
  { key: 'tool', label: 'Tool', icon: Wrench },
  { key: 'cloud', label: 'Cloud', icon: Cloud },
  { key: 'concept', label: 'Concept', icon: Lightbulb },
] as const;

const CATEGORY_STYLE: Record<string, { border: string; bg: string; text: string; chip: string }> = {
  framework: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    text: 'text-blue-700 dark:text-blue-300',
    chip: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  },
  language: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    text: 'text-amber-700 dark:text-amber-300',
    chip: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  },
  tool: {
    border: 'border-l-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-950/20',
    text: 'text-purple-700 dark:text-purple-300',
    chip: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
  },
  cloud: {
    border: 'border-l-cyan-500',
    bg: 'bg-cyan-50 dark:bg-cyan-950/20',
    text: 'text-cyan-700 dark:text-cyan-300',
    chip: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800',
  },
  concept: {
    border: 'border-l-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-900/30',
    text: 'text-slate-600 dark:text-slate-300',
    chip: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
};

export default function LevelUpPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [analyses, setAnalyses] = useState<Record<number, SkillAnalysis>>({});
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [suggestedResume, setSuggestedResume] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const { data: items, isLoading } = useQuery({
    queryKey: ['level-up'],
    queryFn: fetchLevelUpItems,
  });

  const generateMut = useMutation({
    mutationFn: generateLevelUp,
    onSuccess: (data) => {
      toast({ title: `Generated ${data.generated} skills from ${data.items.length} reviews` });
      queryClient.invalidateQueries({ queryKey: ['level-up'] });
    },
    onError: () => toast({ title: 'Generation failed', variant: 'error' }),
  });

  const analyzeMut = useMutation({
    mutationFn: ({ id, input }: { id: number; input: string }) => analyzeLevelUpSkill(id, input),
  });

  const resolveMut = useMutation({
    mutationFn: resolveLevelUpItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['level-up'] });
      toast({ title: 'Resolved' });
    },
  });

  const suggestMut = useMutation({
    mutationFn: suggestResume,
    onSuccess: (data) => setSuggestedResume(data.suggested),
    onError: () => toast({ title: 'Failed', variant: 'error' }),
  });

  const handleAnalyze = async (item: LevelUpItem) => {
    const input = inputs[item.id] || '';
    if (!input.trim()) return;
    setAnalyzingId(item.id);
    try {
      const result = await analyzeMut.mutateAsync({ id: item.id, input });
      setAnalyses((prev) => ({ ...prev, [item.id]: result }));
    } catch {
      toast({ title: 'Analysis failed', variant: 'error' });
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleResolve = (id: number) => {
    resolveMut.mutate(id);
    setAnalyses((prev) => { const n = { ...prev }; delete n[id]; return n; });
    setInputs((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  // Compute counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: (items || []).length };
    for (const cat of CATEGORIES) {
      if (cat.key === 'all') continue;
      counts[cat.key] = (items || []).filter((i) => i.category === cat.key).length;
    }
    return counts;
  }, [items]);

  const activeItems = (items || [])
    .filter((i) => i.status !== 'mastered')
    .filter((i) => filter === 'all' || i.category === filter);

  const resolvedItems = (items || []).filter((i) => i.status === 'mastered');

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-purple-500" />
            Level Up
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Type what you know about each gap. AI suggests exact resume edits.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => suggestMut.mutate()} disabled={suggestMut.isPending} className="gap-2">
            {suggestMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Suggest Full Resume
          </Button>
          <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending} className="gap-2">
            {generateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </Button>
        </div>
      </div>

      {/* Suggested Resume */}
      {suggestedResume && (
        <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-purple-100 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30">
            <span className="text-sm font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Suggested Resume Update
            </span>
            <button onClick={() => setSuggestedResume(null)} className="text-purple-400 hover:text-purple-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <pre className="p-5 text-xs text-slate-600 dark:text-slate-400 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
            {suggestedResume}
          </pre>
        </div>
      )}

      {/* Filter chips */}
      {items && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = filter === cat.key;
            const count = categoryCounts[cat.key] || 0;
            if (cat.key !== 'all' && count === 0) return null;
            const style = CATEGORY_STYLE[cat.key];

            return (
              <button
                key={cat.key}
                onClick={() => setFilter(cat.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                  isActive
                    ? (style?.chip || 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700')
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
              >
                <Icon className="h-3 w-3" />
                {cat.label}
                <span className={cn(
                  'rounded-full px-1.5 py-0 text-[10px] font-mono',
                  isActive ? 'bg-white/50 dark:bg-black/20' : 'bg-slate-100 dark:bg-slate-800'
                )}>
                  {count}
                </span>
              </button>
            );
          })}

          {resolvedItems.length > 0 && (
            <button
              onClick={() => setShowResolved(!showResolved)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ml-auto',
                showResolved
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              )}
            >
              {showResolved ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {resolvedItems.length} resolved
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : !items || items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-12 text-center">
          <Target className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-600 dark:text-slate-300">No skills tracked yet</h3>
          <p className="text-sm text-slate-400 mt-1">Click "Generate" to analyze all job reviews.</p>
          <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending} className="mt-4 gap-2">
            {generateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Generate from Jobs
          </Button>
        </div>
      ) : (
        <>
          {/* Active items */}
          {activeItems.length > 0 ? (
            <div className="space-y-3">
              {activeItems.map((item) => {
                const style = CATEGORY_STYLE[item.category || 'concept'] || CATEGORY_STYLE.concept;
                const analysis = analyses[item.id];
                const isAnalyzing = analyzingId === item.id;

                return (
                  <div key={item.id} className={cn('rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 border-l-4 overflow-hidden', style.border)}>
                    {/* Header */}
                    <div className={cn('px-4 py-3 flex items-center justify-between gap-3', style.bg)}>
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.skill_name}</span>
                        <span className={cn('text-[10px] font-medium rounded-full px-2 py-0.5 border', style.chip)}>
                          {item.category}
                        </span>
                        {item.source_job_ids && (
                          <span className="text-[10px] text-slate-400">{item.source_job_ids.length} job{item.source_job_ids.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>

                    {/* Text input */}
                    <div className="px-4 py-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={inputs[item.id] || ''}
                          onChange={(e) => setInputs((p) => ({ ...p, [item.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAnalyze(item); }}
                          placeholder="e.g. I've used it in a side project, know a competitor, learning now..."
                          className="flex-1 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleAnalyze(item)}
                          disabled={isAnalyzing || !(inputs[item.id] || '').trim()}
                          className="gap-1.5 shrink-0"
                        >
                          {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Analyze
                        </Button>
                      </div>
                      {item.notes && (
                        <p className="text-xs text-slate-400 mt-2 italic">"{item.notes}"</p>
                      )}
                    </div>

                    {/* AI Analysis result */}
                    {analysis && (
                      <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 px-4 py-3 space-y-3">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="h-4 w-4 text-purple-500 mt-0.5 shrink-0" />
                          <p className="text-sm text-slate-600 dark:text-slate-400">{analysis.interpretation}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-500">Verdict:</span>
                          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                            analysis.verdict === 'knows_it' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                            analysis.verdict === 'learning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                            analysis.verdict === 'knows_competitor' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          )}>
                            {analysis.verdict === 'knows_it' ? 'Knows it' :
                             analysis.verdict === 'learning' ? 'Learning' :
                             analysis.verdict === 'knows_competitor' ? 'Knows competitor' : "Doesn't know"}
                          </span>
                        </div>

                        {analysis.suggested_edits.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                              <GitCommit className="h-3 w-3" /> Suggested edits
                            </div>
                            {analysis.suggested_edits.map((edit, i) => (
                              <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                                <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700/50 text-[10px] text-slate-500 font-mono">
                                  {edit.file} → {edit.section}
                                </div>
                                <div className="px-3 py-2 space-y-1.5 text-xs font-mono">
                                  <div className="flex items-start gap-2">
                                    <span className="text-red-500 shrink-0">−</span>
                                    <span className="text-red-600 dark:text-red-400">{edit.old === 'ADD' ? '(new entry)' : edit.old}</span>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <span className="text-emerald-500 shrink-0">+</span>
                                    <span className="text-emerald-600 dark:text-emerald-400">{edit.new}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <p className="text-xs text-slate-400">{analysis.explanation}</p>

                        <div className="flex gap-2 pt-1">
                          <Button size="sm" onClick={() => handleResolve(item.id)} className="gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Apply & Resolve
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => {
                            setAnalyses((p) => { const n = { ...p }; delete n[item.id]; return n; });
                          }}>
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No skills in this category. All caught up!</p>
            </div>
          )}

          {/* Resolved items */}
          {showResolved && resolvedItems.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Resolved</p>
              {resolvedItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 opacity-60">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  {item.skill_name}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
