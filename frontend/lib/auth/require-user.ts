import { createClient } from "@/lib/supabase/server";

/**
 * Resolves the authenticated user (and the server Supabase client) for use in
 * route handlers. The proxy/AI routes are NOT covered by middleware, so each
 * one must gate access explicitly.
 */
export async function getRouteUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, supabase };
}

/** Standard 401 response for unauthenticated route access. */
export function unauthorized() {
  return new Response(JSON.stringify({ error: "Authentication required." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
