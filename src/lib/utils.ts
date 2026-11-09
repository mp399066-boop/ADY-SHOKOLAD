import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'dd/MM/yyyy');
  } catch {
    return '-';
  }
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, 'dd/MM/yyyy HH:mm');
  } catch {
    return '-';
  }
}

export function formatCurrency(amount: number | null | undefined, currency = '₪'): string {
  if (amount === null || amount === undefined) return '-';
  return `${currency}${amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getInventoryStatus(
  qty: number,
  lowThreshold: number,
  criticalThreshold: number
): string {
  if (qty <= 0) return 'אזל מהמלאי';
  if (qty <= criticalThreshold) return 'קריטי';
  if (qty <= lowThreshold) return 'מלאי נמוך';
  return 'תקין';
}

/**
 * A free-text search term made safe for a PostgREST `.or('col.ilike.%x%,…')`
 * filter: characters that end or nest a condition (`, ( ) " \`) are dropped
 * and the LIKE wildcards are escaped, so the text can only ever be matched,
 * never change the filter.
 */
export function orFilterTerm(raw: string, max = 80): string {
  return raw.replace(/[,()"\\]/g, ' ').trim().slice(0, max).replace(/[%_]/g, '\\$&');
}

export function generateOrderNumber(): string {
  // Israel's date, not the server's (UTC on Vercel) — an order placed after
  // midnight Israel time used to carry the previous day in its number.
  const [y, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }).split('-');
  const year = y.slice(-2);
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `ORD-${year}${month}${day}-${random}`;
}
