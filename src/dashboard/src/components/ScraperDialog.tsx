import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Info } from 'lucide-react';

interface ScraperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    url: string;
    selectors?: {
      title?: string;
      company?: string;
      location?: string;
      description?: string;
    };
  }) => void;
  loading?: boolean;
}

export default function ScraperDialog({
  open,
  onOpenChange,
  onSubmit,
  loading,
}: ScraperDialogProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [titleSelector, setTitleSelector] = useState('');
  const [companySelector, setCompanySelector] = useState('');
  const [locationSelector, setLocationSelector] = useState('');
  const [descSelector, setDescSelector] = useState('');

  const hasSelectors =
    titleSelector || companySelector || locationSelector || descSelector;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !url) return;

    const selectors = hasSelectors
      ? {
          ...(titleSelector && { title: titleSelector }),
          ...(companySelector && { company: companySelector }),
          ...(locationSelector && { location: locationSelector }),
          ...(descSelector && { description: descSelector }),
        }
      : undefined;

    onSubmit({ name, url, selectors });

    // Reset form
    setName('');
    setUrl('');
    setTitleSelector('');
    setCompanySelector('');
    setLocationSelector('');
    setDescSelector('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle onClose={() => onOpenChange(false)}>
            Add Custom Scraper
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., My Custom Job Board"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              URL
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/jobs"
              type="url"
              required
            />
          </div>

          <div className="border-t border-slate-800 pt-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              CSS Selectors (Optional)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Title Selector
                </label>
                <Input
                  value={titleSelector}
                  onChange={(e) => setTitleSelector(e.target.value)}
                  placeholder="h2.job-title"
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Company Selector
                </label>
                <Input
                  value={companySelector}
                  onChange={(e) => setCompanySelector(e.target.value)}
                  placeholder=".company-name"
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Location Selector
                </label>
                <Input
                  value={locationSelector}
                  onChange={(e) => setLocationSelector(e.target.value)}
                  placeholder=".location"
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Description Selector
                </label>
                <Input
                  value={descSelector}
                  onChange={(e) => setDescSelector(e.target.value)}
                  placeholder=".description"
                  className="h-9 text-xs"
                />
              </div>
            </div>
            {!hasSelectors && (
              <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                <Info className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
                <p className="text-xs text-cyan-300/80">
                  Leave blank for AI auto-detection. The agent will automatically
                  identify job listings on the page.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name || !url}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Scraper
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
