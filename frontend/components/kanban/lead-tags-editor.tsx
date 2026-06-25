"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Tag, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

/**
 * Inline tag editor for a single lead (F4). Adds/removes tags on crm_leads with
 * the same claim-on-action semantics as the bulk toolbar (an unassigned lead is
 * assigned to the actor so RLS WITH CHECK passes), and selects back the row so an
 * RLS-blocked 0-row update is reported rather than silently "succeeding".
 */
export function LeadTagsEditor({
  leadId,
  tags,
  assignedTo,
}: {
  leadId: string;
  tags: string[];
  assignedTo: string | null;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function applyTags(next: string[]) {
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
      const update: Record<string, unknown> = { tags: next };
      if (!assignedTo) update.assigned_to = user.id;
      const { data, error } = await supabase
        .from("crm_leads")
        .update(update)
        .eq("id", leadId)
        .select("id");
      if (error) {
        toast.error(error.message);
        return;
      }
      if (!data || data.length === 0) {
        toast.warning("Not permitted to edit this lead.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-details", leadId] });
    } finally {
      setBusy(false);
    }
  }

  function addTag(e: React.FormEvent) {
    e.preventDefault();
    const tag = input.trim().toLowerCase();
    if (!tag) return;
    setInput("");
    if (tags.includes(tag)) return;
    applyTags([...tags, tag]);
  }

  return (
    <div className="mb-6">
      <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Tag className="w-3.5 h-3.5" /> Tags
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs"
          >
            {t}
            <button
              type="button"
              onClick={() => applyTags(tags.filter((x) => x !== t))}
              disabled={busy}
              aria-label={`Remove tag ${t}`}
              className="hover:text-danger transition-colors disabled:opacity-50"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <form onSubmit={addTag} className="flex items-center gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={40}
            placeholder="Add tag"
            disabled={busy}
            className="glass-input px-2 py-1 text-xs w-28"
          />
        </form>
      </div>
    </div>
  );
}
