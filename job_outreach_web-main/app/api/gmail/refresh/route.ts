import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export async function POST(req: NextRequest) {
  try {
    const { provider_refresh_token } = await req.json();

    if (!provider_refresh_token) {
      return NextResponse.json({ error: "No refresh token provided" }, { status: 400 });
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({ error: "Google OAuth credentials not configured in server" }, { status: 500 });
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: provider_refresh_token,
        grant_type: 'refresh_token',
      }).toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data.error_description || data.error || "Failed to refresh token" }, { status: response.status });
    }

    return NextResponse.json({
      provider_token: data.access_token,
      expires_in: data.expires_in,
    });

  } catch (error: any) {
    console.error("Token refresh error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
