'use client';

import { useState, useEffect, useRef, useMemo, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'global-search-recent-v1';
const MAX_RECENT = 3;

type ResultType =
  | 'customer'
  | 'order'
  | 'invoice'
  | 'product'
  | 'package'
  | 'petitFour'
  | 'inventory'
  | 'delivery';

interface SearchResult {
  type: ResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
  meta?: Record<string, string | number | undefined>;
}

const TYPE_LABEL: Record<ResultType, string> = {
  customer:  'לקוחות',
  order:     'הזמנות',
  invoice:   'מסמכים פיננסיים',
  product:   'מוצרים',
  package:   'מארזים',
  petitFour: 'פטיפורים',
  inventory: 'מלאי / חומרי גלם',
  delivery:  'משלוחים',
};

// Render order in the dropdown — most operationally common first.
const TYPE_ORDER: ResultType[] = [
  'customer', 'order', 'invoice', 'delivery',
  'product', 'package', 'petitFour', 'inventory',
];

const BADGE_COLOR: Record<ResultType, { bg: string; fg: string }> = {
  customer:  { bg: '#EAF2FB', fg: '#1E4E8C' },
  order:     { bg: '#FFF4E0', fg: '#8A5A18' },
  invoice:   { bg: '#F1ECF7', fg: '#5B3A8C' },
  product:   { bg: '#E8F4EC', fg: '#1F6B3E' },
  package:   { bg: '#FBE9E7', fg: '#A03C2C' },
  petitFour: { bg: '#FCEEE2', fg: '#8B4A1F' },
  inventory: { bg: '#FDF2D8', fg: '#7A5820' },
  delivery:  { bg: '#E5EEF1', fg: '#496D7D' },
};

const kbdStyle: React.CSSProperties = {
  fontSize: '10px',
  padding: '1px 5px',
  border: '1px solid #E8DED2',
  borderRadius: '3px',
  backgroundColor: '#FFFFFF',
  color: '#5C4A38',
  fontFamily: 'inherit',
};

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recent, setRecent]   = useState<string[]>([]);
  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef    = useRef(0);

  // Load recent searches from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Global keyboard shortcuts: Ctrl/Cmd+K toggles, Esc closes
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('global-search:open', onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('global-search:open', onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Reset on open/close, focus input
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
      setSelectedIdx(0);
    } else {
      setQuery('');
      setResults([]);
      setLoading(false);
    }
  }, [open]);

  // Debounced fetch
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      const myReq = ++reqIdRef.current;
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        const json = await res.json();
        if (reqIdRef.current !== myReq) return;
        setResults(Array.isArray(json.results) ? json.results : []);
        setSelectedIdx(0);
      } catch {
        if (reqIdRef.current === myReq) setResults([]);
      } finally {
        if (reqIdRef.current === myReq) setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const grouped = useMemo(() => {
    const g: Record<ResultType, SearchResult[]> = {
      customer: [], order: [], invoice: [],
      product: [], package: [], petitFour: [],
      inventory: [], delivery: [],
    };
    for (const r of results) (g[r.type] ||= []).push(r);
    return g;
  }, [results]);

  const flatList = useMemo(() => {
    const out: SearchResult[] = [];
    for (const t of TYPE_ORDER) out.push(...grouped[t]);
    return out;
  }, [grouped]);

  const saveRecent = (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    const next = [trimmed, ...recent.filter(r => r !== trimmed)].slice(0, MAX_RECENT);
    setRecent(next);
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const navigate = (r: SearchResult) => {
    saveRecent(query);
    setOpen(false);
    router.push(r.href);
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, Math.max(flatList.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const r = flatList[selectedIdx];
      if (r) navigate(r);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0"
        style={{ zIndex: 60, backgroundColor: 'rgba(58,42,26,0.32)', backdropFilter: 'blur(2px)' }}
      />
      <div
        className="fixed left-1/2 -translate-x-1/2"
        style={{
          zIndex: 61,
          top: '12vh',
          width: '92%',
          maxWidth: '640px',
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow: '0 14px 40px rgba(58,42,26,0.22), 0 0 0 1px #EAE0D4',
          direction: 'rtl',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #EAE0D4',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '17px', color: '#8A7664' }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="חפשי לקוח, הזמנה, מוצר, פטיפור, מלאי, משלוח, מסמך או טלפון…"
            maxLength={80}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '15px',
              color: '#2B1A10',
              backgroundColor: 'transparent',
              fontFamily: 'inherit',
            }}
          />
          <kbd style={{ ...kbdStyle, backgroundColor: '#FAF7F0' }}>Esc</kbd>
        </div>

        {/* Results body */}
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {/* Empty state */}
          {!query.trim() && (
            <div style={{ padding: '14px 18px' }}>
              {recent.length > 0 ? (
                <>
                  <div style={{ fontSize: '11px', color: '#8E7D6A', fontWeight: 600, marginBottom: '6px', letterSpacing: '0.05em' }}>
                    חיפושים אחרונים
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {recent.map(r => (
                      <button
                        key={r}
                        onClick={() => setQuery(r)}
                        style={{
                          textAlign: 'right',
                          padding: '8px 10px',
                          fontSize: '13px',
                          color: '#5C4A38',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FAF7F0'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                      >
                        <span style={{ color: '#B0A090', fontSize: '12px' }}>↻</span>
                        {r}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '13px', color: '#8E7D6A', textAlign: 'center', padding: '22px 0' }}>
                  התחילי להקליד כדי לחפש
                </div>
              )}
            </div>
          )}

          {/* Loading */}
          {query.trim() && loading && (
            <div style={{ padding: '20px', fontSize: '13px', color: '#8E7D6A', textAlign: 'center' }}>
              ...מחפש
            </div>
          )}

          {/* No results */}
          {query.trim() && !loading && flatList.length === 0 && (
            <div style={{ padding: '28px', fontSize: '13px', color: '#8E7D6A', textAlign: 'center' }}>
              לא נמצאו תוצאות
            </div>
          )}

          {/* Grouped results */}
          {!loading && flatList.length > 0 && (
            <div style={{ paddingBottom: '8px' }}>
              {TYPE_ORDER.map(type => {
                const items = grouped[type];
                if (!items.length) return null;
                return (
                  <div key={type}>
                    <div style={{ fontSize: '11px', color: '#8E7D6A', fontWeight: 600, padding: '12px 18px 4px', letterSpacing: '0.05em' }}>
                      {TYPE_LABEL[type]}
                    </div>
                    {items.map(r => {
                      const idx = flatList.indexOf(r);
                      return (
                        <ResultRow
                          key={`${type}-${r.id}`}
                          r={r}
                          selected={idx === selectedIdx}
                          onClick={() => navigate(r)}
                          onHover={() => setSelectedIdx(idx)}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div style={{ padding: '8px 18px', borderTop: '1px solid #EAE0D4', fontSize: '11px', color: '#8E7D6A', display: 'flex', gap: '14px', backgroundColor: '#FDFAF5', flexWrap: 'wrap' }}>
          <span><kbd style={kbdStyle}>↑↓</kbd> ניווט</span>
          <span><kbd style={kbdStyle}>↵</kbd> פתיחה</span>
          <span><kbd style={kbdStyle}>Esc</kbd> סגירה</span>
        </div>
      </div>
    </>
  );
}

function ResultRow({
  r, selected, onClick, onHover,
}: { r: SearchResult; selected: boolean; onClick: () => void; onHover: () => void }) {
  const badge = BADGE_COLOR[r.type];
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      style={{
        width: '100%',
        textAlign: 'right',
        padding: '10px 18px',
        backgroundColor: selected ? '#FBF3E8' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        borderRight: selected ? '3px solid #C9A46A' : '3px solid transparent',
        transition: 'background-color 100ms',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', color: '#2B1A10', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {r.title}
        </div>
        <div style={{ fontSize: '12px', color: '#8A7664', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {r.subtitle}
        </div>
      </div>
      {r.badge && (
        <span style={{
          fontSize: '10px',
          padding: '2px 8px',
          borderRadius: '999px',
          backgroundColor: badge.bg,
          color: badge.fg,
          fontWeight: 600,
          flexShrink: 0,
          letterSpacing: '0.02em',
        }}>
          {r.badge}
        </span>
      )}
    </button>
  );
}
