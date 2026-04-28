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

export function generateOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `ORD-${year}${month}${day}-${random}`;
}
