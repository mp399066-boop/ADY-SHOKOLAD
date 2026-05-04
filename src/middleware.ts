import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Helper: check authorized_users table (RLS policy allows authenticated user to read own row)
  const isAuthorized = async (): Promise<boolean> => {
    if (!user?.email) return false;
    const { data } = await supabase
      .from('authorized_users')
      .select('is_active')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();
    return data?.is_active === true;
  };

  if (pathname === '/login') {
    if (user) {
      const authorized = await isAuthorized();
      if (authorized) {
        // Already logged in and authorized → go to dashboard
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
      // Logged in to Google but not authorized → stay on /login (page will sign them out)
    }
    return supabaseResponse;
  }

  // All other protected routes
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const authorized = await isAuthorized();
  if (!authorized) {
    return NextResponse.redirect(new URL('/login?error=unauthorized', request.url));
  }

  return supabaseResponse;
}

export const config = {
  // Protect all routes except: Next.js internals, static files, auth callback, API routes
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
