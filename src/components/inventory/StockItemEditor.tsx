'use client';

// Opens the right edit window for any stock item given only its kind + id —
// used by screens that list mixed stock alerts (dashboard) and hold no full
// rows. Raw materials load themselves; products / petit fours are fetched here.

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { RawMaterialEditModal } from './RawMaterialEditModal';
import { CatalogItemEditModal, type CatalogEditTarget } from './CatalogItemEditModal';

export type StockItemRef = { kind: 'raw' | 'product' | 'petitFour'; id: string };

export function StockItemEditor({ item, onClose, onSaved }: {
  item: StockItemRef | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [catalogTarget, setCatalogTarget] = useState<CatalogEditTarget | null>(null);

  useEffect(() => {
    setCatalogTarget(null);
    if (!item || item.kind === 'raw') return;
    let cancelled = false;
    const url = item.kind === 'product' ? `/api/products/${item.id}` : `/api/petit-four-types/${item.id}`;
    fetch(url)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok || !j.data) { toast.error(j.error || 'טעינת הפריט נכשלה'); onClose(); return; }
        setCatalogTarget(item.kind === 'product' ? { kind: 'product', item: j.data } : { kind: 'petitfour', item: j.data });
      })
      .catch(() => { if (!cancelled) { toast.error('טעינת הפריט נכשלה'); onClose(); } });
    return () => { cancelled = true; };
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <RawMaterialEditModal
        materialId={item?.kind === 'raw' ? item.id : null}
        onClose={onClose}
        onSaved={() => onSaved?.()}
      />
      <CatalogItemEditModal
        target={catalogTarget}
        onClose={() => { setCatalogTarget(null); onClose(); }}
        onSaved={() => onSaved?.()}
      />
    </>
  );
}
