"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Loader2, CheckCircle2, XCircle, Activity } from "lucide-react";

/**
 * Active Jobs panel — live scrape pipeline status.
 * Subscribes to pipeline_runs via Supabase Realtime so the user sees the
 * Bronze → Silver → Gold job progress instead of guessing.
 */

interface PipelineRun {
  id: string;
  city: string | null;
  niche: string | null;
  status: "queued" | "bronze" | "silver" | "gold" | "done" | "failed";
  bronze_count: number;
  silver_count: number;
  gold_count: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

const STAGE: Record<
  PipelineRun["status"],
  { label: string; cls: string; active: boolean }
> = {
  queued: { label: "Queued", cls: "text-text-muted", active: true },
  bronze: { label: "Scraping…", cls: "text-info", active: true },
  silver: { label: "Cleaning…", cls: "text-info", active: true },
  gold: { label: "Scoring…", cls: "text-warning", active: true },
  done: { label: "Done", cls: "text-success", active: false },
  failed: { label: "Failed", cls: "text-danger", active: false },
};

export function ActiveJobs() {
  const queryClient = useQueryClient();

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
              className="flex items-center justify-between gap-3 text-xs rounded-lg bg-glass-bg border border-glass-border px-3 py-2"
            >
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
