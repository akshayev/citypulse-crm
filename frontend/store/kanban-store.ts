import { create } from "zustand";

/**
 * CityPulse CRM — Zustand Store
 * Source: 05-Frontend-Architecture.md
 *
 * Manages instantaneous drag-and-drop state, sidebar toggles,
 * and modal visibility without prop-drilling.
 */

interface KanbanStore {
  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Modals
  pitchModalOpen: boolean;
  pitchLeadId: string | null;
  openPitchModal: (leadId: string) => void;
  closePitchModal: () => void;

  scrapeModalOpen: boolean;
  openScrapeModal: () => void;
  closeScrapeModal: () => void;

  leadDetailId: string | null;
  openLeadDetail: (leadId: string) => void;
  closeLeadDetail: () => void;

  // Drag state
  activeDragId: string | null;
  setActiveDragId: (id: string | null) => void;

  // Search & filters (mirrored from URL for quick access)
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useKanbanStore = create<KanbanStore>((set) => ({
  // Sidebar
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Pitch Modal
  pitchModalOpen: false,
  pitchLeadId: null,
  openPitchModal: (leadId) => set({ pitchModalOpen: true, pitchLeadId: leadId }),
  closePitchModal: () => set({ pitchModalOpen: false, pitchLeadId: null }),

  // Scrape Modal
  scrapeModalOpen: false,
  openScrapeModal: () => set({ scrapeModalOpen: true }),
  closeScrapeModal: () => set({ scrapeModalOpen: false }),

  // Lead Detail
  leadDetailId: null,
  openLeadDetail: (leadId) => set({ leadDetailId: leadId }),
  closeLeadDetail: () => set({ leadDetailId: null }),

  // Drag
  activeDragId: null,
  setActiveDragId: (id) => set({ activeDragId: id }),

  // Search
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
