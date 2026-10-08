// Client-only export helpers for the /finance page: Excel (.xlsx) and image (.png).
// xlsx and html2canvas are imported dynamically so they stay out of the
// initial page bundle and never enter SSR.

export type Cell = string | number | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFileName(fileName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Builds a right-to-left workbook from the sheets and downloads it. */
export async function downloadExcel(fileName: string, sheets: Sheet[]): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    // Column widths from the longest value in each column.
    const widths: number[] = [];
    for (const row of sheet.rows) {
      row.forEach((v, i) => {
        const len = v == null ? 0 : String(v).length;
        widths[i] = Math.max(widths[i] ?? 8, Math.min(len + 2, 45));
      });
    }
    ws['!cols'] = widths.map(wch => ({ wch }));
    // Sheet names: max 31 chars, unique, no []:*?/\
    let name = sheet.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet';
    let n = 2;
    while (used.has(name)) name = `${sheet.name.slice(0, 27)} (${n++})`;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  wb.Workbook = { ...(wb.Workbook ?? {}), Views: [{ RTL: true }] };
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  triggerDownload(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`,
  );
}

/**
 * Rasterises a DOM element to PNG and downloads it. Elements inside marked
 * `data-export-hide` are left out, and scroll containers marked
 * `data-export-expand` are unrolled so wide tables aren't cut off.
 */
export async function downloadElementPng(el: HTMLElement, fileName: string): Promise<void> {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(el, {
    backgroundColor: '#FFFFFF',
    scale: 2,
    useCORS: true,
    logging: false,
    windowWidth: Math.max(el.scrollWidth + 80, 1200),
    onclone: (doc) => {
      doc.querySelectorAll<HTMLElement>('[data-export-hide]').forEach(n => { n.style.display = 'none'; });
      doc.querySelectorAll<HTMLElement>('[data-export-expand]').forEach(n => {
        n.style.overflow = 'visible';
        n.style.maxHeight = 'none';
      });
      doc.querySelectorAll<HTMLElement>('[data-export-show]').forEach(n => { n.style.display = 'block'; });
    },
  });
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob-failed'))), 'image/png'),
  );
  triggerDownload(blob, fileName.endsWith('.png') ? fileName : `${fileName}.png`);
}

export const fmtILS = (n: number) =>
  `₪${(Math.round(n * 100) / 100).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
