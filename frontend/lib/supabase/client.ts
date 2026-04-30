import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client for client components.
 * Source: 05-Frontend-Architecture.md
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
