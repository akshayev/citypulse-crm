"use client";

export const dynamic = "force-dynamic";

import { KanbanBoard } from "@/components/kanban/kanban-board";
import { PitchGenerator } from "@/components/kanban/pitch-generator";
import { ScrapeForm } from "@/components/forms/scrape-form";
import { ActiveJobs } from "@/components/jobs/active-jobs";
import { LeadDetailsModal } from "@/components/kanban/lead-details-modal";
import { BulkToolbar } from "@/components/kanban/bulk-toolbar";
import { useKanbanStore } from "@/store/kanban-store";
import { Plus } from "lucide-react";

/**
 * Dashboard Main Page — The Command Center
 * Source: 12-Features-Roadmap.md
 */
export default function DashboardPage() {
  const { openScrapeModal } = useKanbanStore();

  return (
    <div className="h-full flex flex-col">
      {/* Action Bar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            Sales Pipeline
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Drag leads between columns to update their status
          </p>
        </div>

        <button
          onClick={openScrapeModal}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          New Scrape
        </button>
      </div>

      {/* Live scrape job status */}
      <ActiveJobs />

      {/* Kanban Board */}
      <div className="flex-1 min-h-0">
        <KanbanBoard />
      </div>

      {/* Modals */}
      <PitchGenerator />
      <ScrapeForm />
      <LeadDetailsModal />

      {/* Bulk-action toolbar (shows when leads are selected) */}
      <BulkToolbar />
    </div>
  );
}
