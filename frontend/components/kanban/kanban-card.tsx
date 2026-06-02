"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Flame, Phone, Globe, MapPin, Sparkles, Ban } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn, getHeatScoreClass, formatPhone } from "@/lib/utils";
import { useKanbanStore } from "@/store/kanban-store";
import type { Lead } from "./kanban-board";

interface KanbanCardProps {
  lead: Lead;
  isDragging?: boolean;
}

/**
 * Kanban Card — Draggable lead card
 * Source: 06-UI-UX-Guidelines.md
 *
 * - Heat score badge with color coding
 * - Drag: scale-105 + deeper drop shadow
 * - "Generate AI Pitch" button
 */
export function KanbanCard({ lead, isDragging = false }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: lead.id,
  });

  const { openPitchModal, openLeadDetail } = useKanbanStore();
  const shop = lead.cleaned_shops;

  const queryClient = useQueryClient();
  const rejectLead = useMutation({
    mutationFn: async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      
      // Execute concurrently
      await Promise.all([
        supabase.from("crm_leads").update({ status: "lost" }).eq("id", lead.id),
        supabase.from("dnc_registry").insert({
          phone: shop?.phone || null,
          website_domain: shop?.website || null,
          reason: "Manually rejected via Kanban",
        })
      ]);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const previous = queryClient.getQueryData(["leads"]);

      queryClient.setQueryData(["leads"], (old: Lead[] | undefined) =>
        old?.map((l) =>
          l.id === lead.id ? { ...l, status: "lost" } : l
        )
      );

      return { previous };
    },
    onSuccess: () => {
      toast.success("Lead rejected and added to DNC list.");
    },
    onError: (_err, _vars, context) => {
      toast.error("Failed to reject lead.");
      if (context?.previous) {
        queryClient.setQueryData(["leads"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => openLeadDetail(lead.id)}
      className={cn(
        "glass-card p-4 kanban-card cursor-pointer",
        isDragging && "kanban-card-dragging"
      )}
    >
      {/* Top row: Shop name + Heat Score */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h4 className="text-sm font-semibold text-text-primary leading-tight flex-1">
          {shop?.shop_name || "Unknown Business"}
        </h4>
        <span className={cn("heat-badge shrink-0", getHeatScoreClass(lead.heat_score))}>
          <Flame className="w-3 h-3 mr-1" />
          {lead.heat_score}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1.5 mb-3">
        {shop?.phone && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Phone className="w-3 h-3 text-text-muted" />
            <span>{formatPhone(shop.phone)}</span>
          </div>
        )}
        {shop?.website && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Globe className="w-3 h-3 text-text-muted" />
            <span className="truncate">{shop.website}</span>
          </div>
        )}
        {shop?.city && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <MapPin className="w-3 h-3 text-text-muted" />
            <span>{shop.city}</span>
          </div>
        )}
      </div>

      {/* AI Reasoning */}
      {lead.reasoning && (
        <p className="text-xs text-text-muted mb-3 line-clamp-2 italic">
          &ldquo;{lead.reasoning}&rdquo;
        </p>
      )}

      {/* Rating */}
      {shop?.rating && (
        <div className="flex items-center gap-2 text-xs text-text-muted mb-3">
          <span>⭐ {shop.rating}/5.0</span>
          <span>({shop.review_count} reviews)</span>
        </div>
      )}

      {/* Card Actions */}
      <div className="flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            openPitchModal(lead.id);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          AI Pitch
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            rejectLead.mutate();
          }}
          disabled={rejectLead.isPending}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
          title="Reject & add to DNC blocklist"
        >
          <Ban className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
