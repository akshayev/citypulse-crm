import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { streamText } from "ai";

export const runtime = "edge";

/**
 * AI Pitch Generation API Route
 * Source: 11-LLM-Prompt-Architecture.md
 *
 * Uses Vercel AI SDK to stream personalized cold-call scripts
 * via Server-Sent Events (SSE).
 */

// Exact system prompt from 11-LLM-Prompt-Architecture.md
const COLD_SCRIPT_SYSTEM_PROMPT = `You are a world-class B2B sales closer. Write a short, highly personalized WhatsApp outreach message (under 75 words) to the owner of {shop_name}. 
Context: {reasoning_from_heat_score}
Rules:
1. Do not use generic greetings like "Dear Sir/Madam."
2. Immediately state the specific digital problem identified in the context.
3. Propose a quick, low-friction solution.
4. End with a soft call to action.
5. Output plain text only. Do not use markdown formatting or emojis.`;

import { getRouteUser, unauthorized } from "@/lib/auth/require-user";

// Best-effort per-user burst limiter. This lives in-memory per warm isolate, so
// it is NOT a distributed guarantee — the durable, cross-instance cap is the
// per-user daily Gemini quota RPC below. Its job is to throttle rapid repeated
// clicks on "Generate pitch" from a single user within an isolate.
const PITCH_WINDOW_MS = 60_000;
const PITCH_MAX_PER_WINDOW = 10;
const pitchHits = new Map<string, number[]>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (pitchHits.get(userId) || []).filter(
    (t) => now - t < PITCH_WINDOW_MS
  );
  if (recent.length >= PITCH_MAX_PER_WINDOW) {
    pitchHits.set(userId, recent);
    return true;
  }
  recent.push(now);
  pitchHits.set(userId, recent);
  return false;
}

export async function POST(request: Request) {
  try {
    // Gate: only authenticated users may generate pitches (burns LLM budget).
    const { user, supabase } = await getRouteUser();
    if (!user) return unauthorized();

    if (isRateLimited(user.id)) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please slow down." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const { shopName, reasoning, city, heatScore } = await request.json();

    // Check FinOps quota (spec: 03-Security)
    const maxCalls = parseInt(process.env.NEXT_PUBLIC_GEMINI_DAILY_LIMIT || "50", 10);
    
    const { data: isAllowed, error: rpcError } = await supabase.rpc(
      "increment_gemini_calls",
      { max_calls: maxCalls }
    );

    if (rpcError || !isAllowed) {
      return new Response(
        JSON.stringify({ error: "Daily AI generation limit reached. Please try again tomorrow." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build the personalized prompt
    const systemPrompt = COLD_SCRIPT_SYSTEM_PROMPT
      .replace("{shop_name}", shopName)
      .replace("{reasoning_from_heat_score}", reasoning);

    const userPrompt = `Generate a cold outreach message for ${shopName} located in ${city}. 
Their heat score is ${heatScore}/100. 
Context: ${reasoning}`;

    // Stream the response via the Vercel AI SDK, preferring Gemini and falling
    // back to the free Groq tier when Gemini errors (e.g. quota or key issues).
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    const hasGroq = !!process.env.GROQ_API_KEY;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let emittedAny = false;
        const run = async (
          model: Parameters<typeof streamText>[0]["model"]
        ) => {
          const result = streamText({
            model,
            system: systemPrompt,
            prompt: userPrompt,
            temperature: 0.7,
          });
          for await (const chunk of result.textStream) {
            emittedAny = true;
            controller.enqueue(encoder.encode(chunk));
          }
        };

        try {
          await run(google(geminiModel));
        } catch (err) {
          console.error("Gemini pitch failed:", err);
          // Only safe to switch providers if nothing was streamed yet.
          if (hasGroq && !emittedAny) {
            try {
              await run(groq(groqModel));
            } catch (err2) {
              controller.error(err2);
              return;
            }
          } else {
            controller.error(err);
            return;
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Pitch generation error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate pitch" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
