"use client";

import { useDroppable } from "@dnd-kit/core";
import { KanbanCard } from "./kanban-card";
import type { Lead } from "./kanban-board";

interface KanbanColumnProps {
  id: string;
  title: string;
  color: string;
  leads: Lead[];
}

/**
 * Kanban Column — Droppable zone
 * Source: 06-UI-UX-Guidelines.md
 */
export function KanbanColumn({ id, title, color, leads }: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-80 min-w-[320px] shrink-0 rounded-xl transition-all duration-200 ${
        isOver ? "ring-2 ring-accent/50 scale-[1.01]" : ""
      }`}
      style={{ background: color }}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-glass-bg text-text-secondary">
            {leads.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {leads.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-text-muted">No leads here</p>
            <p className="text-xs text-text-muted mt-1">
              Drag cards to move them
            </p>
          </div>
        ) : (
          leads.map((lead) => <KanbanCard key={lead.id} lead={lead} />)
        )}
      </div>
    </div>
  );
}
