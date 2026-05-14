import { performEmployeeReportAction } from '@/lib/employee-report-actions';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: {
    orderId?: string;
    action?: string;
    exp?: string;
    expires?: string;
    sig?: string;
  };
};

function messageFor(result: Awaited<ReturnType<typeof performEmployeeReportAction>>) {
  if (result.status === 'expired') {
    return {
      title: 'הקישור פג תוקף.',
      text: 'אפשר לשלוח דוח חדש כדי לקבל קישור פעולה חדש.',
      tone: 'error' as const,
    };
  }
  if (result.status === 'invalid') {
    return {
      title: 'הקישור אינו תקין.',
      text: 'לא ניתן לבצע את הפעולה מהקישור הזה.',
      tone: 'error' as const,
    };
  }
  if (result.status === 'already_done') {
    return {
      title: 'הפעולה כבר בוצעה.',
      text: 'העדכון כבר שמור במערכת.',
      tone: 'success' as const,
    };
  }
  if (result.action === 'acknowledged') {
    return {
      title: 'ההזמנה סומנה כהתקבלה',
      text: 'תודה, העדכון נשמר במערכת.',
      tone: 'success' as const,
    };
  }
  return {
    title: 'ההזמנה סומנה כמוכנה למשלוח',
    text: 'תודה, סטטוס ההזמנה עודכן במערכת.',
    tone: 'success' as const,
  };
}

export default async function OrderActionPage({ searchParams }: PageProps) {
  const result = await performEmployeeReportAction({
    orderId: searchParams.orderId || '',
    action: searchParams.action || '',
    expires: searchParams.expires || searchParams.exp || '',
    sig: searchParams.sig || '',
  });
  const msg = messageFor(result);
  const color = msg.tone === 'success' ? '#476D53' : '#9D4B4A';
  const bg = msg.tone === 'success' ? '#E8F0E7' : '#F4E4E1';

  return (
    <main dir="rtl" className="min-h-screen px-4 py-10" style={{ backgroundColor: '#F8F3EC' }}>
      <div
        className="mx-auto max-w-md rounded-2xl border p-6 text-center shadow-sm"
        style={{ backgroundColor: '#FFFDF9', borderColor: '#E8D8C6' }}
      >
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold"
          style={{ backgroundColor: bg, color }}
        >
          {msg.tone === 'success' ? '✓' : '!'}
        </div>
        <h1 className="mb-2 text-xl font-bold" style={{ color: '#2F1B14' }}>
          {msg.title}
        </h1>
        <p className="text-sm leading-6" style={{ color: '#7B604D' }}>
          {msg.text}
        </p>
      </div>
    </main>
  );
}
