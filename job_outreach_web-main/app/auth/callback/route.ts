import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

// This route handles the OAuth PKCE callback from Supabase.
// After Google OAuth completes, Supabase redirects here with a ?code= parameter.
// We exchange the code for a session (stored in cookies) and redirect based on
// whether the user has completed onboarding.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // If a specific 'next' path was provided, use that
      if (next) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      // Check if user has completed onboarding
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('onboarding_completed')
            .eq('user_id', user.id)
            .single();

          if (profile?.onboarding_completed === true) {
            return NextResponse.redirect(`${origin}/dashboard`);
          } else {
            return NextResponse.redirect(`${origin}/onboarding`);
          }
        }
      } catch (err) {
        // If profile check fails, default to dashboard (middleware will handle redirect)
        console.warn('Auth callback profile check failed:', err);
      }

      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  // If code exchange fails or no code, redirect to home with error indication
  return NextResponse.redirect(`${origin}/?auth_error=true`);
}
