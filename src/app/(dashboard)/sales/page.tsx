'use client';

import { useEffect, useState } from 'react';
import { Tabs } from '@/components/ui/Tabs';
import QuotesTab from './components/QuotesTab';
import RequestsTab from './components/RequestsTab';
import HolidaysTab from './components/HolidaysTab';

type TabKey = 'quotes' | 'requests' | 'holidays';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'holidays', label: 'חגים ולקוחות לחזרה' },
  { key: 'quotes', label: 'הצעות מחיר' },
  { key: 'requests', label: 'בקשות מהטופס' },
];

export default function SalesPage() {
  const [tab, setTab] = useState<TabKey>('holidays');
  const [newRequests, setNewRequests] = useState<number | undefined>(undefined);

  // /sales?tab=quotes|requests|holidays — links from the owner's emails.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'quotes' || t === 'requests' || t === 'holidays') setTab(t);
  }, []);

  const changeTab = (k: string) => {
    setTab(k as TabKey);
    window.history.replaceState(null, '', `/sales?tab=${k}`);
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-xl font-semibold text-[#2A1C10]">מכירות</h1>
        <p className="text-sm mt-0.5 text-[#7B604D]">
          הכנה לחגים, פנייה ללקוחות מהשנה שעברה, הצעות מחיר ובקשות שמגיעות מטופס ההזמנה.
        </p>
      </div>
      <Tabs
        tabs={TABS.map(t => ({ ...t, count: t.key === 'requests' ? newRequests || undefined : undefined }))}
        activeTab={tab}
        onChange={changeTab}
      />
      {tab === 'holidays' && <HolidaysTab />}
      {tab === 'quotes' && <QuotesTab />}
      {/* Kept mounted so the "new requests" badge is loaded once. */}
      <div hidden={tab !== 'requests'}><RequestsTab onNewCount={setNewRequests} /></div>
    </div>
  );
}
