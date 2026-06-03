'use client';

// Floating "demo mode" indicator + interceptor bootstrap.
//
// Importing this module installs the fetch interceptor at module-load time
// (before any page effect fires), guaranteeing no real /api call slips through
// on the first render in demo mode. The badge itself only renders when demo
// mode is active, so the component is inert for every normal user.

import { useEffect, useState } from 'react';
import { installDemoInterceptor, isDemoActive, exitDemo } from '@/lib/demo/intercept';

// Runs once when the client bundle evaluates — earlier than React effects.
installDemoInterceptor();

export default function DemoBadge() {
  const [active, setActive] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    installDemoInterceptor(); // idempotent — covers fast-refresh / re-mounts
    setActive(isDemoActive());
    // ?recording=1 keeps demo mode ON but hides the badge so it never appears
    // in the marketing video. Persisted per-tab so it survives navigations.
    try {
      const param = new URL(window.location.href).searchParams.get('recording');
      if (param === '1') sessionStorage.setItem('adi_demo_recording', '1');
      if (param === '0') sessionStorage.removeItem('adi_demo_recording');
      setHidden(sessionStorage.getItem('adi_demo_recording') === '1');
    } catch { /* ignore */ }
  }, []);

  if (!active || hidden) return null;

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed', bottom: '16px', insetInlineStart: '16px', zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 14px', borderRadius: '9999px',
        backgroundColor: '#3A2A1A', color: '#FBF6EE',
        boxShadow: '0 6px 20px rgba(58,42,26,0.28)',
        fontSize: '13px', fontWeight: 600, letterSpacing: '0.01em',
      }}
    >
      <span
        style={{
          width: '8px', height: '8px', borderRadius: '9999px',
          backgroundColor: '#E7B96B', boxShadow: '0 0 0 3px rgba(231,185,107,0.25)',
        }}
      />
      מצב הדגמה — נתוני דמו בלבד
      <button
        onClick={() => { exitDemo(); window.location.href = '/dashboard'; }}
        style={{
          marginInlineStart: '4px', padding: '2px 10px', borderRadius: '9999px',
          backgroundColor: 'rgba(251,246,238,0.14)', color: '#FBF6EE',
          fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer',
        }}
      >
        יציאה
      </button>
    </div>
  );
}
