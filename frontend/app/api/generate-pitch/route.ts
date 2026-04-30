import { google } from "@ai-sdk/google";
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

export async function POST(request: Request) {
  try {
    const { shopName, reasoning, city, heatScore } = await request.json();

    // Build the personalized prompt
    const systemPrompt = COLD_SCRIPT_SYSTEM_PROMPT
      .replace("{shop_name}", shopName)
      .replace("{reasoning_from_heat_score}", reasoning);

    const userPrompt = `Generate a cold outreach message for ${shopName} located in ${city}. 
Their heat score is ${heatScore}/100. 
Context: ${reasoning}`;

    // Stream the response using Vercel AI SDK
    const result = streamText({
      model: google("gemini-1.5-flash"),
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Pitch generation error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate pitch" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
