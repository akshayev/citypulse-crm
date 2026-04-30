"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Copy, Check } from "lucide-react";
import { useKanbanStore } from "@/store/kanban-store";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

/**
 * AI Pitch Generator — SSE Streaming Typewriter Effect
 * Source: 06-UI-UX-Guidelines.md, 11-LLM-Prompt-Architecture.md
 *
 * Uses Server-Sent Events to stream the AI cold-calling script
 * chunk-by-chunk, replicating the ChatGPT typewriter effect.
 */
export function PitchGenerator() {
  const { pitchModalOpen, pitchLeadId, closePitchModal } = useKanbanStore();
  const [streamedText, setStreamedText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // Fetch lead details for the pitch
  const { data: lead } = useQuery({
    queryKey: ["lead", pitchLeadId],
    queryFn: async () => {
      if (!pitchLeadId) return null;
      const supabase = createClient();
      const { data } = await supabase
        .from("crm_leads")
        .select(`
          *,
          cleaned_shops (shop_name, phone, website, city, rating, review_count)
        `)
        .eq("id", pitchLeadId)
        .single();
      return data;
    },
    enabled: !!pitchLeadId,
  });

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [streamedText]);

  async function generatePitch() {
    if (!lead) return;
    setStreamedText("");
    setIsStreaming(true);
    setError(null);

    try {
      const response = await fetch("/api/generate-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName: lead.cleaned_shops?.shop_name || "Business",
          reasoning: lead.reasoning || "No digital presence found.",
          city: lead.cleaned_shops?.city || "",
          heatScore: lead.heat_score,
        }),
      });

      if (response.status === 429) {
        setError("Daily AI quota reached (50 calls). Try again tomorrow.");
        setIsStreaming(false);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to generate pitch");
      }

      // SSE streaming — read the response chunk by chunk
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        setStreamedText((prev) => prev + chunk);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      toast.error("Failed to generate pitch.");
    } finally {
      setIsStreaming(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(streamedText);
    setCopied(true);
    toast.success("Pitch copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  if (!pitchModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="glass-card w-full max-w-lg p-6 max-h-[95vh] flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-bold text-text-primary">
              AI Pitch Generator
            </h2>
          </div>
          <button
            onClick={closePitchModal}
            className="p-1.5 rounded-lg hover:bg-glass-hover transition-colors"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {/* Lead Info */}
        {lead && (
          <div className="p-3 rounded-lg bg-glass-bg border border-glass-border mb-4">
            <p className="text-sm font-medium text-text-primary">
              {lead.cleaned_shops?.shop_name}
            </p>
            <p className="text-xs text-text-muted mt-1">
              Heat Score: {lead.heat_score} •{" "}
              {lead.cleaned_shops?.city}
            </p>
          </div>
        )}

        {/* Generated Text with Typewriter Effect */}
        <div
          ref={textRef}
          className="min-h-[160px] max-h-[280px] overflow-y-auto p-4 rounded-lg bg-background border border-glass-border text-sm text-text-secondary leading-relaxed mb-4"
        >
          {streamedText ? (
            <span>
              {streamedText}
              {isStreaming && <span className="typewriter-cursor" />}
            </span>
          ) : error ? (
            <p className="text-danger">{error}</p>
          ) : (
            <p className="text-text-muted italic">
              Click &quot;Generate&quot; to create a personalized pitch script...
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={generatePitch}
            disabled={isStreaming}
            className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
          >
            {isStreaming ? (
              <>
                <span className="spinner" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Pitch
              </>
            )}
          </button>

          {streamedText && !isStreaming && (
            <button
              onClick={handleCopy}
              className="btn-ghost flex items-center gap-2 text-sm"
            >
              {copied ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
