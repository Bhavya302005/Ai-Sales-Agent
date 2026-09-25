import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';

// POST /api/credits/deduct — Atomically deduct 1 credit
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { type = 'generation', description = 'AI email generation' } = body;

    // Call the atomic deduction function
    const { data, error } = await supabase.rpc('deduct_credit', {
      p_user_id: user.id,
      p_type: type,
      p_description: description,
    });

    if (error) {
      console.error('Credit deduction RPC error:', error.message);
      return NextResponse.json({ error: 'Failed to deduct credit' }, { status: 500 });
    }

    const result = data?.[0] || data;

    if (!result?.success) {
      return NextResponse.json({
        error: result?.message || 'Insufficient credits',
        credits: result?.remaining_credits ?? 0,
      }, { status: 402 }); // 402 Payment Required
    }

    return NextResponse.json({
      success: true,
      credits: result.remaining_credits,
      message: result.message,
    });

  } catch (error: any) {
    console.error('Credit deduction error:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
