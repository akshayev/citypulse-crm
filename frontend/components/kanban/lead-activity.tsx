"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, ArrowRightLeft, Sparkles, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface ActivityRow {
  id: string;
  type: "note" | "status_change" | "pitch" | "assignment";
  content: string | null;
  created_at: string;
}

const ICONS = {
  note: MessageSquare,
  status_change: ArrowRightLeft,
  pitch: Sparkles,
  assignment: UserPlus,
} as const;

/**
 * Lead activity timeline + note composer (D1). Status changes are auto-logged
 * by a DB trigger; notes are added here.
 */
export function LeadActivity({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");

  const { data: activity = [], isLoading } = useQuery<ActivityRow[]>({
    queryKey: ["lead-activity", leadId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("lead_activity")
        .select("id, type, content, created_at")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ActivityRow[];
    },
  });

  const addNote = useMutation({
    mutationFn: async (content: string) => {
      const supabase = createClient();
      // created_by defaults to auth.uid() server-side (RLS WITH CHECK enforces it).
      const { error } = await supabase
        .from("lead_activity")
        .insert({ lead_id: leadId, type: "note", content });
      if (error) throw error;
    },
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["lead-activity", leadId] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Failed to add note."),
  });

  function submitNote(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) return;
    addNote.mutate(trimmed);
  }

  return (
    <div className="flex flex-col">
      {/* Note composer */}
      <form onSubmit={submitNote} className="mb-5">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Add a note about this lead..."
          className="glass-input w-full px-3 py-2 text-sm resize-none"
        />
        <div className="flex justify-end mt-2">
          <button
            type="submit"
            disabled={addNote.isPending || !note.trim()}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {addNote.isPending && <span className="spinner" />}
            Add note
          </button>
        </div>
      </form>

      {/* Timeline */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="spinner w-6 h-6" />
        </div>
      ) : activity.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">
          No activity yet. Status changes and notes will appear here.
        </p>
      ) : (
        <ul className="space-y-3">
          {activity.map((a) => {
            const Icon = ICONS[a.type] ?? MessageSquare;
            return (
              <li key={a.id} className="flex gap-3">
                <div className="w-7 h-7 shrink-0 rounded-full bg-glass-bg border border-glass-border flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary whitespace-pre-wrap break-words">
                    {a.content}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {formatDistanceToNow(new Date(a.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
