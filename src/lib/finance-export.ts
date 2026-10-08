// Client-only export helpers for the /finance page: Excel (.xlsx) and image (.png).
// xlsx and html2canvas are imported dynamically so they stay out of the
// initial page bundle and never enter SSR.

import type { FinanceReport, ReportSection } from '@/lib/finance-report';

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

export const fmtILS = (n: number) => {
  const v = Math.round(n * 100) / 100;
  // Whole shekels stay clean (₪250); anything with agorot always shows two digits (₪12,729.20).
  const digits = Number.isInteger(v) ? 0 : 2;
  return `₪${v.toLocaleString('he-IL', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

// ── Full report → PDF ───────────────────────────────────────────────────────
// Each section is rendered as real HTML (so Hebrew/RTL is shaped by the
// browser), rasterised block by block, and stacked onto A4 pages. Tables are
// split between rows — never through a row — and repeat their header on every
// page.


const PDF_W = 794; // A4 width in CSS px at 96dpi
const ROWS_PER_CHUNK = 40; // ≈ one full A4 page per table chunk

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cellHtml(v: Cell, isMoney: boolean): string {
  if (v == null || v === '') return '';
  if (isMoney && typeof v === 'number') {
    const neg = v < 0;
    return `${neg ? '−' : ''}${fmtILS(Math.abs(v))}`;
  }
  return esc(v);
}

// Cells never wrap, except long free text (customer names, descriptions),
// so dates, order numbers and amounts always stay on one line.
function cellClass(v: Cell, isMoney: boolean): string {
  if (isMoney) return 'num';
  return typeof v === 'string' && v.length > 22 ? 'wrap' : '';
}

function tableHtml(sec: ReportSection, rows: Cell[][], withTotal: boolean): string {
  const t = sec.table!;
  const head = t.headers.map(h => `<th>${esc(h)}</th>`).join('');
  const cells = (r: Cell[]) => r.map((v, i) => `<td class="${cellClass(v, t.moneyCols.includes(i))}">${cellHtml(v, t.moneyCols.includes(i))}</td>`).join('');
  const body = rows.map(r => `<tr>${cells(r)}</tr>`).join('');
  const total = withTotal && t.total ? `<tr class="total">${cells(t.total)}</tr>` : '';
  const wide = t.headers.length >= 8 ? ' class="wide"' : '';
  return `<table${wide}><thead><tr>${head}</tr></thead><tbody>${body}${total}</tbody></table>`;
}

const REPORT_CSS = `
  .blk, .blk * { box-sizing: border-box; }
  .blk { width:${PDF_W}px; padding: 10px 34px; background:#fff; direction: rtl; font-family: Arial, Helvetica, sans-serif; color:#3A2A1A; }
  .blk h1 { font-size: 22px; margin: 0 0 4px; color:#5C3410; }
  .blk h2 { font-size: 15px; margin: 6px 0 8px; color:#5C3410; border-bottom: 2px solid #C9A46A; padding-bottom: 4px; }
  .blk .meta { font-size: 12px; color:#8A7664; }
  .blk .kpis { display:grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .blk .kpi { border:1px solid #EAE0D4; border-radius:8px; padding:8px 10px; }
  .blk .kpi .l { font-size:11px; color:#8A7664; }
  .blk .kpi .v { font-size:17px; font-weight:bold; margin-top:2px; }
  .blk .green { color:#2F6B3A; } .blk .red { color:#A0362C; } .blk .amber { color:#9A6A12; }
  .blk table { width:100%; border-collapse: collapse; font-size: 11px; }
  .blk table.wide { font-size: 10px; }
  .blk th { background:#FAF7F0; color:#8A7664; font-weight:bold; text-align:right; padding:5px 5px; border-bottom:1px solid #EAE0D4; white-space: nowrap; }
  .blk td { padding:4px 5px; border-bottom:1px solid #F0EAE2; text-align:right; white-space: nowrap; }
  .blk td.wrap { white-space: normal; }
  .blk td.num { white-space: nowrap; direction: ltr; text-align: right; unicode-bidi: plaintext; }
  .blk tr.total td { font-weight:bold; background:#FAF7F0; border-top:2px solid #C9A46A; }
  .blk .notes { margin-top: 6px; font-size: 11px; color:#8A7664; }
  .blk .notes div { margin: 2px 0; }
`;

function reportBlocks(r: FinanceReport, businessName: string): string[] {
  const blocks: string[] = [
    `<h1>${esc(businessName)} — ${esc(r.title)}</h1><div class="meta">תקופה: ${esc(r.periodLabel)} · הופק: ${esc(r.generatedAt)}</div>`,
  ];
  for (const sec of r.sections) {
    let head = `<h2>${esc(sec.title)}</h2>`;
    if (sec.kpis) {
      head += `<div class="kpis">${sec.kpis.map(k =>
        `<div class="kpi"><div class="l">${esc(k.label)}</div><div class="v ${k.tone ?? ''}">${k.money ? fmtILS(k.value) : esc(k.value.toLocaleString('he-IL'))}</div></div>`,
      ).join('')}</div>`;
    }
    const notes = sec.notes?.length ? `<div class="notes">${sec.notes.map(n => `<div>• ${esc(n)}</div>`).join('')}</div>` : '';
    if (!sec.table) { blocks.push(head + notes); continue; }
    const rows = sec.table.rows;
    if (rows.length === 0) { blocks.push(head + `<div class="meta">אין נתונים בתקופה זו</div>` + notes); continue; }
    for (let i = 0; i < rows.length; i += ROWS_PER_CHUNK) {
      const chunk = rows.slice(i, i + ROWS_PER_CHUNK);
      const last = i + ROWS_PER_CHUNK >= rows.length;
      const title = i === 0 ? head : `<h2>${esc(sec.title)} (המשך)</h2>`;
      blocks.push(title + tableHtml(sec, chunk, last) + (last ? notes : ''));
    }
  }
  return blocks;
}

/** Renders the full report to an A4 PDF (for preview or download). */
export async function buildReportPdf(r: FinanceReport, businessName: string): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${PDF_W}px;z-index:-1;background:#fff`;
  host.innerHTML = `<style>${REPORT_CSS}</style>`;
  document.body.appendChild(host);

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageW = 210, pageH = 297, marginTop = 10, marginBottom = 14;
    const usable = pageH - marginTop - marginBottom;
    let y = marginTop;

    for (const html of reportBlocks(r, businessName)) {
      const el = document.createElement('div');
      el.className = 'blk';
      el.innerHTML = html;
      host.appendChild(el);
      const canvas = await html2canvas(el, { backgroundColor: '#FFFFFF', scale: 1.6, logging: false, width: PDF_W, windowWidth: PDF_W });
      host.removeChild(el);
      let h = (canvas.height / canvas.width) * pageW;
      let w = pageW;
      if (h > usable) { w = (usable / h) * pageW; h = usable; } // safety: never overflow a page
      if (y + h > pageH - marginBottom && y > marginTop) { pdf.addPage(); y = marginTop; }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', (pageW - w) / 2, y, w, h);
      y += h;
    }

    const pages = pdf.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      pdf.setPage(p);
      pdf.setFontSize(9);
      pdf.setTextColor(150);
      pdf.text(`${p} / ${pages}`, pageW / 2, pageH - 6, { align: 'center' });
    }
    return pdf.output('blob');
  } finally {
    host.remove();
  }
}

/** Downloads a ready PDF blob under the report's file name. */
export function downloadPdfBlob(blob: Blob, r: FinanceReport) {
  triggerDownload(blob, `${r.fileBase}.pdf`);
}

/** Downloads the full report as a multi-sheet Excel workbook. */
export async function downloadReportExcel(r: FinanceReport): Promise<void> {
  const { reportToSheets } = await import('@/lib/finance-report');
  await downloadExcel(r.fileBase, reportToSheets(r));
}
