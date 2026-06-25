"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useKanbanStore } from "@/store/kanban-store";
import { useModalA11y } from "@/lib/hooks/use-modal-a11y";
import {
  type PipelineRun,
  STAGE,
  STEPPER,
  STAGE_INDEX,
} from "@/lib/pipeline";

/**
 * Full-screen live progress overlay for a just-launched scrape (F3). Subscribes
 * to the single pipeline_runs row and shows Bronze→Silver→Gold→Done with a bar
 * and counts. Dismissing it leaves the pipeline running server-side.
 */
export function ScrapeProgressOverlay() {
  const { activeRunId, setActiveRunId } = useKanbanStore();
  const queryClient = useQueryClient();
  const close = () => setActiveRunId(null);
  const dialogRef = useModalA11y<HTMLDivElement>(!!activeRunId, close);

  const { data: run } = useQuery<PipelineRun | null>({
    queryKey: ["run", activeRunId],
    enabled: !!activeRunId,
    queryFn: async () => {
      const supabase = createClient();
      // maybeSingle: the row may not be readable for a beat right after launch
      // (replica lag) — return null and let realtime fill it in, rather than throw.
      const { data, error } = await supabase
        .from("pipeline_runs")
        .select("*")
        .eq("id", activeRunId)
        .maybeSingle();
      if (error) throw error;
      return (data as PipelineRun) ?? null;
    },
  });

  // Live updates for just this run.
  useEffect(() => {
    if (!activeRunId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`run_${activeRunId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pipeline_runs",
          filter: `id=eq.${activeRunId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["run", activeRunId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeRunId, queryClient]);

  if (!activeRunId) return null;

  const status = run?.status ?? "queued";
  const stage = STAGE[status];
  const currentIdx = STAGE_INDEX[status];
  const failed = status === "failed";
  const done = status === "done";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Scrape progress"
        tabIndex={-1}
        className="glass-card w-full max-w-lg p-8 outline-none relative"
      >
        <button
          onClick={close}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-glass-hover transition-colors"
        >
          <X className="w-5 h-5 text-text-muted" />
        </button>

        <div className="text-center mb-6">
          <h2 className="text-lg font-bold text-text-primary">
            {done
              ? "Scrape complete"
              : failed
                ? "Scrape failed"
                : "Scraping in progress"}
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            {run?.niche || "—"} in {run?.city || "—"}
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between mb-6">
          {STEPPER.map((step, i) => {
            const stepIdx = STAGE_INDEX[step.key];
            // When the run is done, every step (incl. the final "Done") is complete.
            const complete = !failed && (done || currentIdx > stepIdx);
            const isActive = !failed && !done && currentIdx === stepIdx;
            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors ${
                      complete
                        ? "bg-success border-success text-white"
                        : isActive
                          ? "border-accent text-accent"
                          : "border-glass-border text-text-muted"
                    }`}
                  >
                    {complete ? (
                      <Check className="w-4 h-4" />
                    ) : isActive ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span className="text-xs">{i + 1}</span>
                    )}
                  </div>
                  <span className="text-[11px] text-text-muted">{step.label}</span>
                </div>
                {i < STEPPER.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 -mt-5 ${
                      complete ? "bg-success" : "bg-glass-border"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-glass-bg overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              failed ? "bg-danger" : "bg-accent"
            }`}
            style={{ width: `${stage.pct}%` }}
          />
        </div>

        {/* Counts */}
        <div className="flex items-center justify-center gap-4 text-xs text-text-secondary mb-2">
          <span>
            <span className="font-mono text-text-primary">
              {run?.bronze_count ?? 0}
            </span>{" "}
            scraped
          </span>
          <span>
            <span className="font-mono text-text-primary">
              {run?.silver_count ?? 0}
            </span>{" "}
            cleaned
          </span>
          <span>
            <span className="font-mono text-text-primary">
              {run?.gold_count ?? 0}
            </span>{" "}
            scored
          </span>
        </div>

        {failed && run?.error && (
          <p className="text-xs text-danger text-center mt-3 break-words">
            {run.error}
          </p>
        )}

        {/* Footer */}
        <div className="mt-6 flex justify-center gap-3">
          {done ? (
            <>
              <span className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="w-4 h-4" />
                {run?.gold_count ?? 0} leads scored
              </span>
              <button onClick={close} className="btn-primary text-sm">
                View leads
              </button>
            </>
          ) : failed ? (
            <button onClick={close} className="btn-primary text-sm">
              Close
            </button>
          ) : (
            <p className="text-xs text-text-muted">
              You can close this and keep working — the scrape continues and
              leads stream onto the board live.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
