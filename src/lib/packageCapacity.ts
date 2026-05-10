// Capacity helpers for petit-four selections inside a package.
// A package has a fixed size (גודל_מארז). The sum of selected petit-four
// quantities must equal exactly that size; we use these helpers to compute the
// running total, derive a UI state (under/full/over/unknown), and decide
// whether saving is allowed.
//
// `capacity = 0` (or missing) means the package size is unknown — we don't
// block save in that case, only show a soft warning, per product spec.

export type CapacityState = 'unknown' | 'under' | 'full' | 'over';

export interface CapacityInfo {
  selected: number;
  capacity: number;
  remaining: number;   // capacity - selected; negative when over
  overage: number;     // max(0, selected - capacity)
  state: CapacityState;
  message: string;     // human-friendly Hebrew label
  blocking: boolean;   // true when save MUST be blocked
}

export function sumPetitFours(items: { כמות: number }[] | undefined | null): number {
  if (!items) return 0;
  return items.reduce((sum, it) => sum + (Number(it.כמות) || 0), 0);
}

export function getCapacityInfo(selected: number, capacity: number): CapacityInfo {
  const cap = Number(capacity) || 0;
  const sel = Math.max(0, Number(selected) || 0);
  if (cap <= 0) {
    return {
      selected: sel,
      capacity: 0,
      remaining: 0,
      overage: 0,
      state: 'unknown',
      message: sel > 0 ? `נבחרו ${sel} — בחר/י מארז כדי לוודא תאימות` : 'בחר/י מארז',
      blocking: false,
    };
  }
  if (sel > cap) {
    const overage = sel - cap;
    return {
      selected: sel,
      capacity: cap,
      remaining: -overage,
      overage,
      state: 'over',
      message: `נבחרו ${sel} / ${cap} — חריגה של ${overage}`,
      blocking: true,
    };
  }
  if (sel === cap) {
    return {
      selected: sel,
      capacity: cap,
      remaining: 0,
      overage: 0,
      state: 'full',
      message: `נבחרו ${sel} / ${cap}`,
      blocking: false,
    };
  }
  const remaining = cap - sel;
  return {
    selected: sel,
    capacity: cap,
    remaining,
    overage: 0,
    state: 'under',
    message: `נבחרו ${sel} / ${cap} — נותרו ${remaining}`,
    blocking: false,
  };
}
