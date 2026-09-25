import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

// GET /api/credits — Fetch current credit balance
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('credits, credits_expires_at')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      // No profile yet — return default 50 credits
      return NextResponse.json({ credits: 50, expires_at: null, expired: false });
    }

    // Check if credits have expired
    const expired = profile.credits_expires_at 
      ? new Date(profile.credits_expires_at) < new Date() 
      : false;

    return NextResponse.json({
      credits: expired ? 0 : (profile.credits ?? 50),
      expires_at: profile.credits_expires_at,
      expired,
    });

  } catch (error: any) {
    console.error('Credits fetch error:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
