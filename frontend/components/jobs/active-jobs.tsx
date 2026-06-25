"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Loader2, CheckCircle2, XCircle, Activity, RotateCw } from "lucide-react";
import { type PipelineRun, STAGE } from "@/lib/pipeline";
import { useKanbanStore } from "@/store/kanban-store";

/**
 * Active Jobs panel — live scrape pipeline status.
 * Subscribes to pipeline_runs via Supabase Realtime so the user sees the
 * Bronze → Silver → Gold job progress instead of guessing.
 */

export function ActiveJobs() {
  const queryClient = useQueryClient();
  const { setActiveRunId } = useKanbanStore();
  // Track runs we've already toasted so a completion fires exactly once.
  const toasted = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  const [rerunning, setRerunning] = useState(false);

  async function rerun(run: PipelineRun) {
    if (!run.city || !run.niche || rerunning) return;
    setRerunning(true);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: run.city, niche: run.niche }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.detail || "Could not start scrape.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["pipeline_runs"] });
      if (body?.run_id) setActiveRunId(body.run_id);
    } catch {
      toast.error("Connection failed.");
    } finally {
      setRerunning(false);
    }
  }

  const { data: runs = [] } = useQuery<PipelineRun[]>({
    queryKey: ["pipeline_runs"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pipeline_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data as PipelineRun[];
    },
  });

  // Live updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("pipeline_runs_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pipeline_runs" },
        () => queryClient.invalidateQueries({ queryKey: ["pipeline_runs"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Fire a toast when a run newly reaches done/failed. Seed the seen-set on the
  // first load so historical runs don't toast on mount.
  useEffect(() => {
    if (runs.length === 0) return;
    if (!seeded.current) {
      runs.forEach((r) => {
        if (r.status === "done" || r.status === "failed") toasted.current.add(r.id);
      });
      seeded.current = true;
      return;
    }
    for (const r of runs) {
      if (
        (r.status === "done" || r.status === "failed") &&
        !toasted.current.has(r.id)
      ) {
        toasted.current.add(r.id);
        if (r.status === "done") {
          toast.success(
            `${r.gold_count} new lead${r.gold_count === 1 ? "" : "s"} — ${
              r.niche || "—"
            } in ${r.city || "—"}`
          );
        } else {
          toast.error(`Scrape failed — ${r.niche || "—"} in ${r.city || "—"}`);
        }
      }
    }
  }, [runs]);

  if (runs.length === 0) return null;

  return (
    <div className="glass-card p-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Recent Jobs</h2>
      </div>
      <div className="space-y-1.5">
        {runs.map((run) => {
          const stage = STAGE[run.status];
          return (
            <div
              key={run.id}
              className="rounded-lg bg-glass-bg border border-glass-border px-3 py-2"
            >
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {stage.active ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent shrink-0" />
                ) : run.status === "done" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-danger shrink-0" />
                )}
                <span className="truncate text-text-secondary">
                  {run.niche || "—"} in {run.city || "—"}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-text-muted">
                  {run.bronze_count}→{run.silver_count}→{run.gold_count}
                </span>
                <span className={`font-medium ${stage.cls}`}>{stage.label}</span>
                <span className="text-text-muted hidden sm:inline">
                  {formatDistanceToNow(new Date(run.started_at), {
                    addSuffix: true,
                  })}
                </span>
                {!stage.active && run.city && run.niche && (
                  <button
                    onClick={() => rerun(run)}
                    disabled={rerunning}
                    title="Scrape again (same city + niche)"
                    aria-label="Scrape again"
                    className="p-1 rounded-md text-text-muted hover:text-accent hover:bg-glass-hover transition-colors disabled:opacity-40"
                  >
                    <RotateCw
                      className={`w-3.5 h-3.5 ${rerunning ? "animate-spin" : ""}`}
                    />
                  </button>
                )}
              </div>
            </div>
            {/* Thin stage progress bar */}
            <div className="h-1 mt-1.5 rounded-full bg-glass-border/40 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  run.status === "failed" ? "bg-danger" : "bg-accent"
                }`}
                style={{ width: `${stage.pct}%` }}
              />
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
