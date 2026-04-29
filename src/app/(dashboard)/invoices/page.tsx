'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Invoice } from '@/types/database';
import { exportToCsv } from '@/lib/exportCsv';
import { IconExport, IconExternalLink } from '@/components/icons';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/invoices')
      .then(r => r.json())
      .then(({ data }) => setInvoices(data || []))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = () => {
    exportToCsv('חשבוניות.csv',
      ['מספר חשבונית', 'לקוח', 'הזמנה', 'סכום', 'סטטוס', 'תאריך'],
      invoices.map(inv => [
        inv.מספר_חשבונית,
        inv.לקוחות ? `${inv.לקוחות.שם_פרטי} ${inv.לקוחות.שם_משפחה}` : '',
        inv.הזמנות?.מספר_הזמנה || '',
        inv.סכום,
        inv.סטטוס,
        inv.תאריך_יצירה,
      ]),
    );
  };

  if (loading) return <PageLoading />;
  if (invoices.length === 0) return <EmptyState title="אין חשבוניות" description="חשבוניות יופיעו כאן לאחר שיווצרו" />;

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border bg-white hover:bg-[#FAF7F2] transition-all duration-200"
          style={{ borderColor: '#D8CCBA', color: '#8B5E34' }}
        >
          <IconExport className="w-3.5 h-3.5" />
          ייצוא לאקסל
        </button>
      </div>
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #E7D2A6' }}>
              {['מספר חשבונית', 'לקוח', 'הזמנה', 'סכום', 'סטטוס', 'תאריך', 'קישור'].map(h => (
                <th key={h} className="px-4 py-3 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => {
              const customer = (inv as Invoice & { לקוחות?: { שם_פרטי: string; שם_משפחה: string } }).לקוחות;
              const order = (inv as Invoice & { הזמנות?: { מספר_הזמנה: string } }).הזמנות;
              return (
                <tr key={inv.id} className="border-b hover:bg-amber-50" style={{ borderColor: '#F5ECD8' }}>
                  <td className="px-4 py-3 font-mono font-medium" style={{ color: '#8B5E34' }}>#{inv.מספר_חשבונית}</td>
                  <td className="px-4 py-3">{customer ? `${customer.שם_פרטי} ${customer.שם_משפחה}` : '-'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/orders/${inv.הזמנה_id}`} className="hover:underline text-xs" style={{ color: '#8B5E34' }}>
                      {order?.מספר_הזמנה || '-'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-semibold">{formatCurrency(inv.סכום)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${inv.סטטוס === 'שולמה' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {inv.סטטוס}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: '#6B4A2D' }}>{formatDate(inv.תאריך_יצירה)}</td>
                  <td className="px-4 py-3">
                    {inv.קישור_חשבונית ? (
                      <a href={inv.קישור_חשבונית} target="_blank" rel="noopener noreferrer" title="פתח PDF" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#B08060] hover:bg-amber-50 hover:text-[#8B5E34] transition-colors">
                        <IconExternalLink className="w-4 h-4" />
                      </a>
                    ) : <span style={{ color: '#B0A090' }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
    </>
  );
}
