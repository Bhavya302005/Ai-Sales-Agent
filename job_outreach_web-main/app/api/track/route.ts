import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Use service role key to bypass RLS policies on tracking endpoint if available, otherwise fallback to anon key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

// 1x1 transparent PNG bytes
const transparentPixelBytes = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 11, 73, 68, 65, 84, 120, 156, 99, 96, 0, 0, 0,
  2, 0, 1, 7, 161, 212, 188, 0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130
]);

// ══════════════════════════════════════════════════════════════════════════════
// SELF-OPEN DETECTION CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

const SELF_OPEN_WINDOW_SECONDS = 120; // 2 minutes — covers sent folder auto-preview

const BOT_UA_PATTERNS = [
  'googleimageproxy', 'google-producer', 'ggpht',
  'microsoft office', 'outlook', 'thunderbird', 'yahoo',
  'wget', 'curl', 'bot', 'spider', 'crawler', 'scan', 'preview',
  'facebookexternalhit', 'slackbot', 'whatsapp', 'telegrambot', 'linkedinbot',
];

function isBotUserAgent(ua: string): boolean {
  const lower = ua.toLowerCase();
  return BOT_UA_PATTERNS.some(pattern => lower.includes(pattern));
}

function pixelResponse(): NextResponse {
  return new NextResponse(transparentPixelBytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      // 1. Fetch the email record — including fields for self-open detection
      const { data: row, error: fetchError } = await supabase
        .from('email_history')
        .select('opens_count, date, user_id, first_open_ip, sender_ip')
        .eq('id', id)
        .maybeSingle();

      if (!fetchError && row) {
        const currentCount = row.opens_count || 0;
        const userAgent = req.headers.get("user-agent") || "";
        const clientIp = req.headers.get("x-forwarded-for")?.split(',')[0]?.trim()
          || req.headers.get("x-real-ip")
          || '';

        // ── FILTER 1: Time Window (2 minutes) ──
        const sentTime = new Date(row.date).getTime();
        const nowTime = new Date().getTime();
        const diffSeconds = (nowTime - sentTime) / 1000;

        if (diffSeconds < SELF_OPEN_WINDOW_SECONDS) {
          console.log(`⏱️ [SELF-OPEN BLOCKED] Hit within ${diffSeconds.toFixed(0)}s of sending. Ignoring.`);
          return pixelResponse();
        }

        // ── FILTER 2: Bot/Scanner User-Agent ──
        if (isBotUserAgent(userAgent)) {
          console.log(`🤖 [BOT IGNORED] Automated UA: ${userAgent.substring(0, 60)}`);
          return pixelResponse();
        }

        // ── FILTER 3: First-Open Skip (TIME-BOUNDED) ──
        // Only skip first open if within 10 minutes of sending.
        // After 10 min, even the first open is likely the recruiter.
        const FIRST_OPEN_SKIP_WINDOW = 600; // 10 minutes
        if (currentCount === 0 && diffSeconds < FIRST_OPEN_SKIP_WINDOW) {
          console.log(`📌 [FIRST OPEN - LIKELY SENDER] Within ${Math.round(diffSeconds)}s. Recording IP, NOT counting.`);
          await supabase
            .from('email_history')
            .update({ first_open_ip: clientIp })
            .eq('id', id);
          return pixelResponse();
        }

        // ── FILTER 4: Same IP as First Open = Sender ──
        if (row.first_open_ip && clientIp && row.first_open_ip === clientIp) {
          console.log(`🔁 [SENDER IP MATCH] Matches first-open IP. Ignoring.`);
          return pixelResponse();
        }

        // ── FILTER 5: Same IP as Sender IP (stored at send time) ──
        if (row.sender_ip && clientIp && row.sender_ip === clientIp) {
          console.log(`🔁 [SENDER IP MATCH] Matches send-time IP. Ignoring.`);
          return pixelResponse();
        }

        // ══════════════════════════════════════════════════════
        // ALL FILTERS PASSED — GENUINE RECRUITER OPEN ✅
        // ══════════════════════════════════════════════════════

        console.log(`📈 [GENUINE OPEN] Count: ${currentCount} → ${currentCount + 1}`);

        const { error: updateError } = await supabase
          .from('email_history')
          .update({
            opened: true,
            opened_at: new Date().toISOString(),
            opens_count: currentCount + 1,
            status: 'Opened'
          })
          .eq('id', id);

        if (updateError) {
          console.error("Failed to update tracking:", updateError);
        }
      } else if (fetchError) {
        console.error("Failed to fetch row for tracking:", fetchError);
      }
    }
  } catch (err) {
    console.error("Tracking error:", err);
  }

  return pixelResponse();
}
