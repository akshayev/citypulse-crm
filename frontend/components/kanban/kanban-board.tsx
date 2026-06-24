"use client";

import { useEffect, useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useKanbanStore } from "@/store/kanban-store";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";

/**
 * Lead type from crm_leads + cleaned_shops join
 */
export interface Lead {
  id: string;
  place_id: string;
  heat_score: number;
  reasoning: string | null;
  status: "new" | "contacting" | "won" | "lost";
  assigned_to: string | null;
  pitch_script: string | null;
  column_order: number;
  created_at: string;
  updated_at: string;
  cleaned_shops: {
    shop_name: string;
    phone: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    rating: number | null;
    review_count: number;
  } | null;
}

const COLUMNS = [
  { id: "new", title: "New Leads", color: "var(--color-kanban-new)" },
  { id: "contacting", title: "Contacting", color: "var(--color-kanban-contacting)" },
  { id: "won", title: "Won", color: "var(--color-kanban-won)" },
  { id: "lost", title: "Lost", color: "var(--color-kanban-lost)" },
] as const;

/**
 * Interactive Kanban Board
 * Source: 06-UI-UX-Guidelines.md
 *
 * - @dnd-kit/core with touch sensors for mobile
 * - Optimistic UI updates via React Query
 * - Supabase Realtime WebSocket sync
 */
export function KanbanBoard() {
  const queryClient = useQueryClient();
  const { activeDragId, setActiveDragId, searchQuery } = useKanbanStore();

  // Configure sensors with touch support (spec: 06)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Pagination state
  const [limit, setLimit] = useState(50);

  // Fetch all leads (paginated globally)
  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ["leads", limit],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_leads")
        .select(`
          *,
          cleaned_shops (
            shop_name, phone, website, address, city, rating, review_count
          )
        `)
        .order("column_order", { ascending: true })
        .limit(limit);

      if (error) throw error;
      return data as Lead[];
    },
  });

  // Mutation for moving cards (Optimistic UI per spec 06)
  const moveLead = useMutation({
    mutationFn: async ({
      leadId,
      newStatus,
      currentAssignedTo,
    }: {
      leadId: string;
      newStatus: string;
      currentAssignedTo: string | null;
    }) => {
      const supabase = createClient();
      const updates: { status: string; assigned_to?: string } = {
        status: newStatus,
      };

      // Claim-on-move: an unassigned lead must be assigned to the current user,
      // otherwise the RLS WITH CHECK (assigned_to = auth.uid()) rejects the
      // update for sales reps and the card silently snaps back.
      if (!currentAssignedTo) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) updates.assigned_to = user.id;
      }

      const { error } = await supabase
        .from("crm_leads")
        .update(updates)
        .eq("id", leadId);

      if (error) throw error;
    },
    // Optimistic UI: snap card instantly, rollback on error
    onMutate: async ({ leadId, newStatus }) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const previous = queryClient.getQueryData<Lead[]>(["leads", limit]);

      queryClient.setQueryData<Lead[]>(["leads", limit], (old) =>
        old?.map((lead) =>
          lead.id === leadId
            ? { ...lead, status: newStatus as Lead["status"] }
            : lead
        )
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      toast.error("Failed to move lead.");
      if (context?.previous) {
        queryClient.setQueryData(["leads", limit], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  // Supabase Realtime subscription (spec: 05)
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("crm_leads_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_leads" },
        () => {
          // Invalidate and refetch on any remote change
          queryClient.invalidateQueries({ queryKey: ["leads"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Drag handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveDragId(String(event.active.id));
    },
    [setActiveDragId]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);

      if (!over) return;

      const leadId = String(active.id);
      const newStatus = String(over.id);

      const lead = leads.find((l) => l.id === leadId);
      if (!lead || lead.status === newStatus) return;

      // Optimistic update (claims the lead if currently unassigned)
      moveLead.mutate({
        leadId,
        newStatus,
        currentAssignedTo: lead.assigned_to,
      });
    },
    [leads, moveLead, setActiveDragId]
  );

  const activeLead = activeDragId
    ? leads.find((l) => l.id === activeDragId)
    : null;

  if (isLoading && leads.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner w-8 h-8" />
      </div>
    );
  }

  // Filter leads based on searchQuery from the store
  const filteredLeads = leads.filter((lead) => {
    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    const shop = lead.cleaned_shops;
    return (
      shop?.shop_name?.toLowerCase().includes(lowerQuery) ||
      shop?.city?.toLowerCase().includes(lowerQuery) ||
      shop?.phone?.includes(lowerQuery) ||
      lead.reasoning?.toLowerCase().includes(lowerQuery)
    );
  });

  return (
    <div className="flex flex-col h-full">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 flex-1 overflow-x-auto pb-4 items-start">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column.id}
              id={column.id}
              title={column.title}
              color={column.color}
              leads={filteredLeads.filter((l) => l.status === column.id)}
            />
          ))}
        </div>

        {/* Drag Overlay — floating card during drag */}
        <DragOverlay>
          {activeLead ? (
            <div className="kanban-card-dragging">
              <KanbanCard lead={activeLead} isDragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      
      {/* Pagination / Load More */}
      {leads.length >= limit && (
        <div className="py-4 flex justify-center shrink-0">
          <button
            onClick={() => setLimit((l) => l + 50)}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-glass border border-glass-border hover:bg-glass-hover rounded-lg transition-colors flex items-center gap-2"
          >
            {isLoading && <div className="spinner w-4 h-4 border-2" />}
            Load More Leads
          </button>
        </div>
      )}
    </div>
  );
}
