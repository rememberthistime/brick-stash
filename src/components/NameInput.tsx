import { useState } from 'react';

/**
 * A name for a unit or drawer. It's saved when you leave the box or press Enter, rather than on every key, because a
 * change to storage works the plan out again.
 */
export default function NameInput({ value, placeholder, label, onChange, className = '' }: { value: string; placeholder: string; label: string; onChange: (name: string) => void; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const next = (draft ?? value).trim();
    setDraft(null);
    if (next !== value.trim()) onChange(next);
  };
  return (
    <input
      className={`name-input ${className}`}
      aria-label={label}
      placeholder={placeholder}
      maxLength={60}
      value={draft ?? value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}
