"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Tag, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useKanbanStore } from "@/store/kanban-store";

const STATUSES = [
  { id: "new", label: "New" },
  { id: "contacting", label: "Contacting" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
] as const;

interface SelectedLead {
  id: string;
  assigned_to: string | null;
  tags: string[] | null;
}

/**
 * Bulk-action toolbar (D2). Appears when leads are multi-selected. Applies
 * changes per-lead with the same claim-on-action semantics as drag (an
 * unassigned lead gets assigned to the actor so RLS WITH CHECK passes).
 */
export function BulkToolbar() {
  const { selectedIds, clearSelection } = useKanbanStore();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [tagText, setTagText] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setIsAdmin(data?.user?.app_metadata?.role === "admin");
    });
  }, []);

  if (selectedIds.length === 0) return null;

  async function applyToSelected(
    buildUpdate: (lead: SelectedLead) => Record<string, unknown>
  ) {
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Not signed in.");
        return;
      }
      const { data: rows, error } = await supabase
        .from("crm_leads")
        .select("id, assigned_to, tags")
        .in("id", selectedIds);
      if (error || !rows) {
        toast.error("Failed to load selected leads.");
        return;
      }
      const results = await Promise.all(
        (rows as SelectedLead[]).map(async (lead) => {
          const update = buildUpdate(lead);
          // Claim-on-action: an unassigned lead must become ours or RLS rejects.
          if (!lead.assigned_to) update.assigned_to = user.id;
          // Select back the row so an RLS-blocked 0-row update (no error) is
          // correctly counted as a failure, not a silent success.
          const { data: upRows, error: upErr } = await supabase
            .from("crm_leads")
            .update(update)
            .eq("id", lead.id)
            .select("id");
          return !upErr && (upRows?.length ?? 0) > 0;
        })
      );
      const ok = results.filter(Boolean).length;
      if (ok < rows.length) {
        toast.warning(`Updated ${ok}/${rows.length} (some weren't permitted).`);
      } else {
        toast.success(`Updated ${ok} lead(s).`);
      }
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      clearSelection();
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    await applyToSelected(() => ({ status }));
  }

  async function addTag() {
    const tag = tagText.trim();
    if (!tag) return;
    setTagText("");
    await applyToSelected((lead) => ({
      tags: Array.from(new Set([...(lead.tags ?? []), tag])),
    }));
  }

  async function deleteSelected() {
    if (!confirm(`Delete ${selectedIds.length} lead(s)? This cannot be undone.`))
      return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_leads")
        .delete()
        .in("id", selectedIds)
        .select("id");
      if (error) {
        toast.error(error.message);
        return;
      }
      const n = data?.length ?? 0;
      if (n === 0) toast.warning("Nothing deleted (not permitted).");
      else toast.success(`Deleted ${n} lead(s).`);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      clearSelection();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 glass-card px-4 py-3 flex flex-wrap items-center gap-3 shadow-xl max-w-[95vw]">
      <span className="text-sm font-medium text-text-primary">
        {selectedIds.length} selected
      </span>

      <div className="flex items-center gap-1">
        <span className="text-xs text-text-muted mr-1">Move to:</span>
        {STATUSES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStatus(s.id)}
            disabled={busy}
            className="px-2.5 py-1 text-xs rounded-lg bg-glass-bg border border-glass-border hover:bg-glass-hover text-text-secondary disabled:opacity-50 transition-colors"
          >
            {s.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addTag();
        }}
        className="flex items-center gap-1.5"
      >
        <div className="relative">
          <Tag className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
          <input
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            maxLength={40}
            placeholder="Add tag"
            className="glass-input pl-7 pr-2 py-1 text-xs w-28"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !tagText.trim()}
          className="px-2.5 py-1 text-xs rounded-lg bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors"
        >
          Apply
        </button>
      </form>

      {isAdmin && (
        <button
          onClick={deleteSelected}
          disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      )}

      <button
        onClick={clearSelection}
        disabled={busy}
        aria-label="Clear selection"
        className="p-1 rounded-lg hover:bg-glass-hover text-text-muted transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
