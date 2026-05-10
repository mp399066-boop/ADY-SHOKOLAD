'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { matchesSearch } from '@/lib/normalize';

export interface ComboboxOption {
  value: string;
  label: string;
  // Optional richer text to match against (e.g. "name + sku + aliases").
  // When provided, the user's query is matched against this instead of `label`.
  // When absent, `label` is used — so existing call sites keep working.
  searchText?: string;
}

interface ComboboxProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}

export function Combobox({
  label,
  value,
  onChange,
  options,
  placeholder = 'בחר...',
  searchPlaceholder = 'חיפוש מוצר...',
  emptyText = 'לא נמצאו מוצרים',
  disabled,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    return options.filter(o => matchesSearch(o.searchText ?? o.label, query));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    setHighlightedIdx(0);
  }, [query, open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlightedIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIdx, open]);

  const handleSelect = (opt: ComboboxOption) => {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleTriggerKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu();
    }
  };

  const handleListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(i => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[highlightedIdx];
      if (opt) handleSelect(opt);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
      requestAnimationFrame(() => triggerRef.current?.focus());
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      {label && (
        <label className="block text-xs font-medium mb-1" style={{ color: '#6B4A2D' }}>
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleTriggerKey}
        disabled={disabled}
        className="w-full px-3 py-2 text-sm border rounded-lg text-right bg-white focus:outline-none focus:ring-1 transition-colors flex items-center justify-between gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          borderColor: open ? '#C7A46B' : '#DDD0BC',
          color: selected ? '#2B1A10' : '#9B7A5A',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate flex-1 min-w-0">{selected?.label || placeholder}</span>
        <svg
          className="w-4 h-4 flex-shrink-0 transition-transform"
          style={{ color: '#9B7A5A', transform: open ? 'rotate(180deg)' : undefined }}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg overflow-hidden"
          style={{ borderColor: '#DDD0BC' }}
          role="listbox"
        >
          <div className="px-2.5 py-2 border-b" style={{ borderColor: '#EDE0CE' }}>
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#9B7A5A' }} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleListKey}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm focus:outline-none text-right"
                style={{ color: '#2B1A10' }}
                dir="rtl"
              />
            </div>
          </div>
          <div ref={listRef} className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center" style={{ color: '#9B7A5A' }}>
                {emptyText}
              </div>
            ) : (
              filtered.map((opt, idx) => {
                const isHighlighted = idx === highlightedIdx;
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    data-idx={idx}
                    onClick={() => handleSelect(opt)}
                    onMouseEnter={() => setHighlightedIdx(idx)}
                    className="w-full text-right px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors"
                    style={{
                      backgroundColor: isHighlighted ? '#FAF7F0' : isSelected ? '#FEF9EF' : 'transparent',
                      color: '#2B1A10',
                    }}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span className="truncate flex-1 min-w-0">{opt.label}</span>
                    {isSelected && (
                      <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="#8B5E34">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
