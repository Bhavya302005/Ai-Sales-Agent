import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';
import crypto from 'crypto';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Credit packs available for purchase
const CREDIT_PACKS: Record<string, { credits: number; amount_paise: number; label: string }> = {
  starter: { credits: 100, amount_paise: 9900, label: '100 Credits — ₹99 (Beta Price)' },
  pro: { credits: 500, amount_paise: 39900, label: '500 Credits — ₹399' },
  mega: { credits: 1500, amount_paise: 89900, label: '1500 Credits — ₹899' },
};

// POST /api/payments/create-order — Creates a Razorpay order
export async function POST(req: NextRequest) {
  try {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 500 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { pack_id } = body;

    const pack = CREDIT_PACKS[pack_id];
    if (!pack) {
      return NextResponse.json({ error: 'Invalid credit pack' }, { status: 400 });
    }

    // Create Razorpay order via API
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    
    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: pack.amount_paise,
        currency: 'INR',
        receipt: `credits_${user.id.substring(0, 8)}_${Date.now()}`,
        notes: {
          user_id: user.id,
          pack_id: pack_id,
          credits: pack.credits.toString(),
        },
      }),
    });

    if (!razorpayRes.ok) {
      const errText = await razorpayRes.text();
      console.error('Razorpay order creation failed:', errText);
      return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 });
    }

    const razorpayOrder = await razorpayRes.json();

    // Save order to our database
    await supabase.from('payment_orders').insert({
      user_id: user.id,
      razorpay_order_id: razorpayOrder.id,
      amount_paise: pack.amount_paise,
      credits: pack.credits,
      status: 'created',
    });

    return NextResponse.json({
      order_id: razorpayOrder.id,
      amount: pack.amount_paise,
      currency: 'INR',
      credits: pack.credits,
      key_id: RAZORPAY_KEY_ID,
    });

  } catch (error: any) {
    console.error('Payment order creation error:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
