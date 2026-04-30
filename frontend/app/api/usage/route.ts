const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY;

export async function GET() {
  if (!BACKEND_API_KEY) {
    return new Response(
      JSON.stringify({ detail: "Backend API key is not configured on the frontend server." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const upstream = await fetch(`${BACKEND_URL}/api/usage`, {
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
      JSON.stringify({ detail: "Failed to fetch usage from backend." }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
