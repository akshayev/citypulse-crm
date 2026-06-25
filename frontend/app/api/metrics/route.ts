import { getRouteUser, unauthorized } from "@/lib/auth/require-user";

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY;

export async function GET() {
  const { user } = await getRouteUser();
  if (!user) return unauthorized();

  if (!BACKEND_API_KEY) {
    return new Response(
      JSON.stringify({ detail: "Backend API key is not configured on the frontend server." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const upstream = await fetch(`${BACKEND_URL}/api/metrics`, {
      method: "GET",
      headers: { "X-API-Key": BACKEND_API_KEY },
      cache: "no-store",
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ detail: "Failed to fetch metrics from backend." }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
