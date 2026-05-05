import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse['cookies']['set']>[2];
};

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
        setAll(cookiesToSet: CookieToSet[]) {
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
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
    return supabaseResponse;
  }

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
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};