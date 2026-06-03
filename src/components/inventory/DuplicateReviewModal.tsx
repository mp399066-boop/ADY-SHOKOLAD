'use client';

// בדיקת כפילויות בחומרי גלם — מציג הצעות וממתין לאישור/דחייה ידני.
// אישור = יצירת שם חלופי (alias) בלבד. לא מוחק, לא ממזג כמויות.

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

interface MaterialMini {
  id: string;
  שם_חומר_גלם: string;
  כמות_במלאי: number;
  יחידת_מידה: string;
}

interface Suggestion {
  id: string;
  reason: string | null;
  primary: MaterialMini;
  duplicate: MaterialMini;
}

export function DuplicateReviewModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Run a fresh scan whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch('/api/inventory/duplicates', { method: 'POST' })
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setSuggestions(json.data ?? []);
      })
      .catch(() => setError('שגיאה בסריקת הכפילויות'))
      .finally(() => setLoading(false));
  }, [open]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/inventory/duplicates/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'שגיאה');
      setSuggestions(prev => prev.filter(s => s.id !== id));
      toast.success(action === 'approve' ? 'חובר כשם חלופי' : 'ההצעה נדחתה');
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setBusyId(null);
    }
  };

  // "דלגי עכשיו" — just hide locally, leave as pending for next time.
  const skip = (id: string) => setSuggestions(prev => prev.filter(s => s.id !== id));

  return (
    <Modal open={open} onClose={onClose} title="בדיקת כפילויות בחומרי גלם" size="lg">
      <div className="space-y-4">
        <p className="text-xs" style={{ color: '#8A735F' }}>
          המערכת מצאה חומרי גלם בעלי שמות דומים. אישור יוצר <strong>שם חלופי</strong> בלבד —
          הכמויות, המתכונים והשורה המקורית לא משתנים ולא נמחקים.
        </p>

        {loading ? (
          <div className="py-10 text-center text-sm" style={{ color: '#9B7A5A' }}>סורק כפילויות…</div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-red-600">{error}</div>
        ) : suggestions.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: '#9B7A5A' }}>לא נמצאו כפילויות אפשריות</div>
        ) : (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto">
            {suggestions.map(s => (
              <div key={s.id} className="rounded-xl border p-4" style={{ borderColor: '#EAE0D4', backgroundColor: '#FDFAF6' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F4E3C9', color: '#8B5E34' }}>
                    {s.reason || 'שמות דומים'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="rounded-lg border p-3" style={{ borderColor: '#D9E5DC', backgroundColor: '#F3F8F4' }}>
                    <p className="text-[10.5px] mb-1" style={{ color: '#476D53' }}>חומר ראשי מוצע</p>
                    <p className="text-sm font-semibold" style={{ color: '#2B1A10' }}>{s.primary.שם_חומר_גלם}</p>
                    <p className="text-xs mt-1" style={{ color: '#6B4A2D' }}>
                      {s.primary.כמות_במלאי} {s.primary.יחידת_מידה}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3" style={{ borderColor: '#E7D2A6', backgroundColor: '#FBF6EC' }}>
                    <p className="text-[10.5px] mb-1" style={{ color: '#A8753D' }}>כפילות אפשרית</p>
                    <p className="text-sm font-semibold" style={{ color: '#2B1A10' }}>{s.duplicate.שם_חומר_גלם}</p>
                    <p className="text-xs mt-1" style={{ color: '#6B4A2D' }}>
                      {s.duplicate.כמות_במלאי} {s.duplicate.יחידת_מידה}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => skip(s.id)}
                    disabled={busyId === s.id}
                    className="text-xs px-3 py-1.5 rounded-lg border bg-white disabled:opacity-50"
                    style={{ borderColor: '#DDD0BC', color: '#8A735F' }}
                  >
                    דלגי עכשיו
                  </button>
                  <button
                    onClick={() => act(s.id, 'reject')}
                    disabled={busyId === s.id}
                    className="text-xs px-3 py-1.5 rounded-lg border bg-white disabled:opacity-50"
                    style={{ borderColor: '#E6C3C0', color: '#9D4B4A' }}
                  >
                    דחי
                  </button>
                  <button
                    onClick={() => act(s.id, 'approve')}
                    disabled={busyId === s.id}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                    style={{ backgroundColor: '#476D53', color: '#FFF' }}
                  >
                    {busyId === s.id ? '…' : 'אשרי חיבור'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="outline" onClick={onClose}>סגור</Button>
        </div>
      </div>
    </Modal>
  );
}
