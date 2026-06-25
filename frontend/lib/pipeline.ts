/** Shared pipeline-run types + stage metadata (used by Active Jobs + progress overlay). */

export type RunStatus =
  | "queued"
  | "bronze"
  | "silver"
  | "gold"
  | "done"
  | "failed";

export interface PipelineRun {
  id: string;
  city: string | null;
  niche: string | null;
  status: RunStatus;
  bronze_count: number;
  silver_count: number;
  gold_count: number;
  llm_cost_usd?: number | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export const STAGE: Record<
  RunStatus,
  { label: string; cls: string; active: boolean; pct: number }
> = {
  queued: { label: "Queued", cls: "text-text-muted", active: true, pct: 8 },
  bronze: { label: "Scraping…", cls: "text-info", active: true, pct: 30 },
  silver: { label: "Cleaning…", cls: "text-info", active: true, pct: 60 },
  gold: { label: "Scoring…", cls: "text-warning", active: true, pct: 85 },
  done: { label: "Done", cls: "text-success", active: false, pct: 100 },
  failed: { label: "Failed", cls: "text-danger", active: false, pct: 100 },
};

/** Ordered steps for the progress stepper (Bronze → Silver → Gold → Done). */
export const STEPPER: { key: RunStatus; label: string }[] = [
  { key: "bronze", label: "Scrape" },
  { key: "silver", label: "Clean" },
  { key: "gold", label: "Score" },
  { key: "done", label: "Done" },
];

/** Monotonic stage index for comparing progress (failed = -1). */
export const STAGE_INDEX: Record<RunStatus, number> = {
  queued: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
  done: 4,
  failed: -1,
};
