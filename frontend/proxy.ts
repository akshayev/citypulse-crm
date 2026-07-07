import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js Edge Middleware
 * Source: 05-Frontend-Architecture.md
 *
 * Intercepts all requests to /dashboard/*.
 * Unauthenticated users are forcefully redirected to /login
 * before the server starts rendering the React tree,
 * completely eliminating UI flicker.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/signup",
  ],
};
