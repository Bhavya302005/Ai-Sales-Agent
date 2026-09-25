import { createBrowserClient } from '@supabase/ssr';

// Browser-side Supabase client — uses cookies for session management.
// This replaces the old createClient() which only used localStorage.
// Using createBrowserClient ensures the session is stored in cookies,
// making it accessible to both client and server (middleware, API routes).
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
