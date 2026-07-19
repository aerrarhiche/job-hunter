import { useState, useCallback, useEffect } from 'react';

interface ResizeState {
  key: string;
  startX: number;
  startWidth: number;
}

export function useResizableColumns(keys: string[], defaults: Record<string, number>) {
  const initial: Record<string, number> = {};
  keys.forEach((k) => { initial[k] = defaults[k] || 120; });
  
  const [widths, setWidths] = useState(initial);
  const [resizing, setResizing] = useState<ResizeState | null>(null);

  const startResize = useCallback((key: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({ key, startX: e.clientX, startWidth: widths[key] });
  }, [widths]);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const diff = e.clientX - resizing.startX;
      const newWidth = Math.max(60, resizing.startWidth + diff);
      setWidths((prev) => ({ ...prev, [resizing.key]: newWidth }));
    };
    const onUp = () => setResizing(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  return { widths, startResize, isResizing: !!resizing };
}

// Resizable header cell component
export function ResizableTh({ children, width, onResizeStart, className }: {
  children: React.ReactNode;
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <th className={className} style={{ width, minWidth: width, position: 'relative' }}>
      {children}
      <div
        onMouseDown={onResizeStart}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-cyan-400/50 transition-colors"
        style={{ userSelect: 'none' }}
      />
    </th>
  );
}
