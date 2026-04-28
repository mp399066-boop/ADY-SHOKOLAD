'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { exportToCsv } from '@/lib/exportCsv';
import { IconExport } from '@/components/icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageLoading } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Input';
import type { Customer } from '@/types/database';

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [count, setCount] = useState(0);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (typeFilter) params.set('type', typeFilter);
    params.set('limit', '100');

    fetch(`/api/customers?${params}`)
      .then(r => r.json())
      .then(({ data, count }) => { setCustomers(data || []); setCount(count || 0); })
      .finally(() => setLoading(false));
  }, [search, typeFilter]);

  const handleExport = () => {
    exportToCsv('לקוחות.csv',
      ['שם פרטי', 'שם משפחה', 'טלפון', 'אימייל', 'סוג לקוח'],
      customers.map(c => [c.שם_פרטי, c.שם_משפחה, c.טלפון || '', c.אימייל || '', c.סוג_לקוח]),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          placeholder="חיפוש שם, טלפון, אימייל..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="w-40"
        >
          <option value="">כל הסוגים</option>
          {['פרטי', 'חוזר', 'VIP', 'מעצב אירועים'].map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
        <span className="text-sm mr-auto" style={{ color: '#6B4A2D' }}>{count} לקוחות</span>
        <Link href="/customers/new"><Button size="sm">+ לקוח חדש</Button></Link>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border bg-white hover:bg-[#FAF7F2] transition-all duration-200"
          style={{ borderColor: '#D8CCBA', color: '#8B5E34' }}
        >
          <IconExport className="w-3.5 h-3.5" />
          ייצוא לאקסל
        </button>
      </div>

      {loading ? <PageLoading /> : customers.length === 0 ? (
        <EmptyState title="אין לקוחות" description="לא נמצאו לקוחות" action={<Link href="/customers/new"><Button>+ לקוח חדש</Button></Link>} />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#FAF7F0', borderBottom: '1px solid #E7D2A6' }}>
                  {['שם מלא', 'טלפון', 'אימייל', 'סוג לקוח', 'הנחה', 'פעולות'].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-semibold" style={{ color: '#6B4A2D' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr
                    key={c.id}
                    className="hover:bg-amber-50 transition-colors border-b cursor-pointer"
                    style={{ borderColor: '#F5ECD8' }}
                    onClick={() => router.push(`/customers/${c.id}`)}
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: '#2B1A10' }}>
                      {c.שם_פרטי} {c.שם_משפחה}
                    </td>
                    <td className="px-4 py-3" style={{ color: '#6B4A2D' }}>{c.טלפון || '-'}</td>
                    <td className="px-4 py-3" style={{ color: '#6B4A2D' }}>{c.אימייל || '-'}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.סוג_לקוח} type="customer" /></td>
                    <td className="px-4 py-3">{c.אחוז_הנחה ? `${c.אחוז_הנחה}%` : '-'}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${c.id}`}
                        onClick={e => e.stopPropagation()}
                        className="text-xs hover:underline ml-3"
                        style={{ color: '#8B5E34' }}
                      >
                        פרופיל
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
