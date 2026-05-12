import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';

interface Props {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  required?: boolean;
  dir?: string;
  type?: string;
  onPick?: (v: string) => void;
}

export default function AutocompleteInput({
  value, onChange, suggestions, placeholder, className, required, dir, type, onPick
}: Props) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = value.trim()
    ? suggestions.filter(s => s && s.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8)
    : suggestions.slice(0, 8);

  const pick = (v: string) => {
    onChange(v);
    onPick?.(v);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open || filtered.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && filtered[hi]) { e.preventDefault(); pick(filtered[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        className={className}
        required={required}
        dir={dir}
        type={type}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.map((s, i) => (
            <button
              type="button"
              key={s + i}
              onMouseDown={e => { e.preventDefault(); pick(s); }}
              className={`block w-full text-right px-3 py-1.5 text-sm hover:bg-accent ${i === hi ? 'bg-accent' : ''}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
