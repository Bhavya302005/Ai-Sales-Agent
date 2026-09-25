import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Middleware runs on every matched request BEFORE the page renders.
// It handles three critical tasks:
// 1. Refreshes the Supabase auth session (keeps cookies alive)
// 2. Protects routes: unauthenticated users can't access /dashboard or /onboarding
// 3. Routes new users (no onboarding) to /onboarding, and onboarded users to /dashboard

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT use getSession() here. getUser() validates the session
  // against the Supabase Auth server, making it tamper-proof.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Protect /dashboard and /onboarding — redirect unauthenticated users to landing
  if ((pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding')) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // For authenticated users: check onboarding status
  if (user && (pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding'))) {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .single();

      const isOnboarded = profile?.onboarding_completed === true;

      // User is on /dashboard but hasn't completed onboarding → redirect to /onboarding
      if (pathname.startsWith('/dashboard') && !isOnboarded) {
        const url = request.nextUrl.clone();
        url.pathname = '/onboarding';
        return NextResponse.redirect(url);
      }

      // User is on /onboarding but already completed → redirect to /dashboard
      if (pathname.startsWith('/onboarding') && isOnboarded) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
      }
    } catch (err) {
      // If profile query fails (e.g., column doesn't exist yet), allow through
      // This gracefully handles the case before SQL migration is run
      console.warn('Onboarding check failed, allowing through:', err);
    }
  }

  // Redirect authenticated users from landing page to dashboard
  // (only for exact "/" path, not for other public pages like /pricing, /privacy etc.)
  if (pathname === '/' && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

// Only run middleware on specific routes, NOT on static assets, API routes, etc.
export const config = {
  matcher: [
    // Match all request paths except:
    // - _next/static (static files)
    // - _next/image (image optimization)
    // - favicon.ico, images, etc
    // - API routes (they handle their own auth)
    // - auth/callback (needs to complete without middleware interference)
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/|auth/).*)',
  ],
};
