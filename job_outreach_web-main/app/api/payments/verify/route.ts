import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';
import crypto from 'crypto';

const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// POST /api/payments/verify — Verify Razorpay payment and credit the user
export async function POST(req: NextRequest) {
  try {
    if (!RAZORPAY_KEY_SECRET) {
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 500 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing payment verification data' }, { status: 400 });
    }

    // Verify signature
    const generated_signature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      console.error('Payment signature mismatch');

      // Mark order as failed
      await supabase
        .from('payment_orders')
        .update({ status: 'failed' })
        .eq('razorpay_order_id', razorpay_order_id)
        .eq('user_id', user.id);

      return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 });
    }

    // Get the order details
    const { data: order, error: orderError } = await supabase
      .from('payment_orders')
      .select('*')
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('user_id', user.id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Prevent double-crediting
    if (order.status === 'paid') {
      return NextResponse.json({ error: 'Order already processed', credits: 0 }, { status: 409 });
    }

    // Update order status
    await supabase
      .from('payment_orders')
      .update({
        status: 'paid',
        razorpay_payment_id,
        razorpay_signature,
      })
      .eq('id', order.id);

    // Add credits to user using the atomic function
    const { data: creditResult, error: creditError } = await supabase.rpc('add_credits', {
      p_user_id: user.id,
      p_amount: order.credits,
      p_type: 'purchase',
      p_description: `Purchased ${order.credits} credits (₹${order.amount_paise / 100})`,
      p_razorpay_payment_id: razorpay_payment_id,
    });

    if (creditError) {
      console.error('Credit addition failed:', creditError.message);
      return NextResponse.json({ error: 'Credits addition failed. Contact support.' }, { status: 500 });
    }

    const result = creditResult?.[0] || creditResult;

    return NextResponse.json({
      success: true,
      credits_added: order.credits,
      new_balance: result?.new_balance ?? 0,
      message: `${order.credits} credits added successfully!`,
    });

  } catch (error: any) {
    console.error('Payment verification error:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
