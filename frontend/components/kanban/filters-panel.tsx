"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, Star, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useKanbanStore } from "@/store/kanban-store";

interface SavedFilter {
  id: string;
  name: string;
  query: { heatMin?: number; tags?: string[]; search?: string };
}

function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Advanced filters + saved presets (D4). */
export function FiltersPanel() {
  const queryClient = useQueryClient();
  const {
    filterHeatMin,
    filterTags,
    searchQuery,
    setFilterHeatMin,
    setFilterTags,
    applyFilters,
    resetFilters,
  } = useKanbanStore();

  const [open, setOpen] = useState(false);
  const [tagInput, setTagInput] = useState(filterTags.join(", "));

  const activeCount =
    (filterHeatMin > 0 ? 1 : 0) + (filterTags.length > 0 ? 1 : 0);

  const { data: saved = [] } = useQuery<SavedFilter[]>({
    queryKey: ["saved-filters"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("saved_filters")
        .select("id, name, query")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SavedFilter[];
    },
  });

  const saveFilter = useMutation({
    mutationFn: async (name: string) => {
      const supabase = createClient();
      // user_id defaults to auth.uid() server-side (RLS enforces it).
      const { error } = await supabase.from("saved_filters").insert({
        name,
        query: { heatMin: filterHeatMin, tags: filterTags, search: searchQuery },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-filters"] });
      toast.success("Filter saved.");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not save filter."),
  });

  const deleteFilter = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("saved_filters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["saved-filters"] }),
  });

  function applyTagInput() {
    setFilterTags(parseTags(tagInput));
  }

  function recall(f: SavedFilter) {
    applyFilters({
      heatMin: f.query.heatMin ?? 0,
      tags: f.query.tags ?? [],
      search: f.query.search ?? "",
    });
    setTagInput((f.query.tags ?? []).join(", "));
    setOpen(false);
  }

  function handleReset() {
    resetFilters();
    setTagInput("");
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost flex items-center gap-2 text-sm"
      >
        <SlidersHorizontal className="w-4 h-4" />
        Filters
        {activeCount > 0 && (
          <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-accent text-white text-[10px] font-bold">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 glass-card p-4 z-40 space-y-4 shadow-xl">
            {/* Heat minimum */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5">
                <Star className="w-3.5 h-3.5 text-warning" /> Minimum heat score:{" "}
                <span className="text-text-primary font-semibold">
                  {filterHeatMin}
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={filterHeatMin}
                onChange={(e) => setFilterHeatMin(Number(e.target.value))}
                className="w-full accent-accent"
              />
            </div>

            {/* Tags */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyTagInput();
              }}
            >
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Tags (comma-separated, matches any)
              </label>
              <div className="flex gap-1.5">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onBlur={applyTagInput}
                  placeholder="vip, follow-up"
                  className="glass-input flex-1 px-2 py-1 text-xs"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 text-xs rounded-lg bg-accent/10 text-accent hover:bg-accent/20"
                >
                  Apply
                </button>
              </div>
            </form>

            <div className="flex justify-between items-center">
              <button
                onClick={handleReset}
                className="text-xs text-text-muted hover:text-text-secondary"
              >
                Reset all
              </button>
              <button
                onClick={() => {
                  const name = prompt("Name this filter:");
                  if (name?.trim()) saveFilter.mutate(name.trim());
                }}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent-light"
              >
                <Save className="w-3 h-3" /> Save current
              </button>
            </div>

            {/* Saved filters */}
            {saved.length > 0 && (
              <div className="border-t border-glass-border pt-3">
                <p className="text-xs font-medium text-text-secondary mb-2">
                  Saved filters
                </p>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {saved.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-2 group"
                    >
                      <button
                        onClick={() => recall(f)}
                        className="flex-1 text-left text-xs text-text-secondary hover:text-text-primary truncate py-1"
                      >
                        {f.name}
                      </button>
                      <button
                        onClick={() => deleteFilter.mutate(f.id)}
                        aria-label={`Delete filter ${f.name}`}
                        className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
