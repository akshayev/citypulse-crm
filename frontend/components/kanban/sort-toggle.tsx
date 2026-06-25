"use client";

import { ArrowDownWideNarrow } from "lucide-react";
import { useKanbanStore } from "@/store/kanban-store";

const MODES = [
  { id: "fifo", label: "FIFO", title: "Oldest first (first in, first out)" },
  { id: "newest", label: "Newest", title: "Newest first" },
  { id: "hottest", label: "Hottest", title: "Highest heat score first" },
] as const;

/** Segmented control for lead ordering (FIFO / Newest / Hottest). */
export function SortToggle() {
  const { sortMode, setSortMode } = useKanbanStore();

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-glass-border bg-glass-bg p-0.5"
      role="group"
      aria-label="Sort leads"
    >
      <ArrowDownWideNarrow className="w-3.5 h-3.5 text-text-muted ml-1.5 mr-0.5" />
      {MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => setSortMode(m.id)}
          title={m.title}
          aria-pressed={sortMode === m.id}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
            sortMode === m.id
              ? "bg-accent text-white"
              : "text-text-secondary hover:bg-glass-hover"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
