'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const isUnauthorized = error === 'unauthorized';
  const hasAuthError = error === 'auth';

  // If redirected here while still having a Google session but not authorized → sign out
  useEffect(() => {
    if (isUnauthorized) {
      createClient().auth.signOut();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: '#F8F6F2', direction: 'rtl' }}
    >
      <div
        className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm"
        style={{ border: '1px solid #EDE0CE' }}
      >
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="text-2xl font-bold mb-1" style={{ color: '#2B1A10' }}>
            עדי תכשיט שוקולד
          </div>
          <div className="text-sm" style={{ color: '#9B7A5A' }}>
            מערכת ניהול
          </div>
        </div>

        {isUnauthorized && (
          <div
            className="mb-5 px-4 py-3 rounded-xl text-sm text-center"
            style={{ backgroundColor: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}
          >
            <div className="font-semibold mb-0.5">אין הרשאה למערכת</div>
            <div className="text-xs" style={{ color: '#B91C1C' }}>
              פני למנהלת המערכת להוספת ההרשאה
            </div>
          </div>
        )}

        {hasAuthError && (
          <div
            className="mb-5 px-3 py-2 rounded-lg text-sm text-center"
            style={{ backgroundColor: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}
          >
            שגיאה בהתחברות — נסי שוב
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all hover:bg-[#FAF7F2] active:scale-[0.98]"
          style={{ borderColor: '#DDD0BC', color: '#2B1A10' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          התחברות עם Google
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
