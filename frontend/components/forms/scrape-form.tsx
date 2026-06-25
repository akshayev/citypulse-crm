"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, Search, Loader2 } from "lucide-react";
import { useKanbanStore } from "@/store/kanban-store";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useModalA11y } from "@/lib/hooks/use-modal-a11y";

/**
 * Scraper Trigger Form — Zod-validated admin form
 * Source: 07-Forms-and-Validation.md
 *
 * City: non-empty string
 * Niche: selected from predefined enum list
 */

const NICHES = [
  "restaurants",
  "salons",
  "gyms",
  "dental clinics",
  "real estate agents",
  "plumbers",
  "electricians",
  "auto repair",
  "pet stores",
  "photography studios",
  "tutoring centers",
  "yoga studios",
  "bakeries",
  "laundry services",
  "car wash",
] as const;

const scrapeSchema = z.object({
  city: z.string().min(1, "City is required"),
  niche: z.enum(NICHES, { message: "Please select a niche" }),
});

type ScrapeFormData = z.infer<typeof scrapeSchema>;

export function ScrapeForm() {
  const { scrapeModalOpen, closeScrapeModal, setActiveRunId } = useKanbanStore();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ScrapeFormData>({
    resolver: zodResolver(scrapeSchema),
  });

  const handleClose = useCallback(() => {
    closeScrapeModal();
    reset();
    setResult(null);
  }, [closeScrapeModal, reset]);

  const dialogRef = useModalA11y<HTMLDivElement>(scrapeModalOpen, handleClose);

  async function onSubmit(data: ScrapeFormData) {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const body = await response.json();

      if (response.status === 429) {
        setResult({ status: "error", message: body.detail || "Quota exceeded" });
      } else if (response.ok) {
        // Hand off to the full-screen progress overlay: track the new run and
        // close the form (the pipeline keeps running server-side regardless).
        queryClient.invalidateQueries({ queryKey: ["pipeline_runs"] });
        if (body.run_id) setActiveRunId(body.run_id);
        handleClose();
        return;
      } else {
        throw new Error(body.detail || "Failed to trigger scrape");
      }
    } catch (err) {
      setResult({
        status: "error",
        message: err instanceof Error ? err.message : "Connection failed",
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (!scrapeModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Trigger scrape"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-md p-6 outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-bold text-text-primary">
              Trigger Scrape
            </h2>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-glass-hover transition-colors"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* City */}
          <div>
            <label
              htmlFor="scrape-city"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              City
            </label>
            <input
              id="scrape-city"
              type="text"
              className="glass-input w-full px-4 py-2.5 text-sm"
              placeholder="e.g., Kochi, Mumbai, Bangalore"
              {...register("city")}
            />
            {errors.city && (
              <p className="text-danger text-xs mt-1.5">{errors.city.message}</p>
            )}
          </div>

          {/* Niche */}
          <div>
            <label
              htmlFor="scrape-niche"
              className="block text-sm font-medium text-text-secondary mb-1.5"
            >
              Business Niche
            </label>
            <select
              id="scrape-niche"
              className="glass-input w-full px-4 py-2.5 text-sm appearance-none"
              {...register("niche")}
            >
              <option value="" className="bg-background">
                Select a niche...
              </option>
              {NICHES.map((niche) => (
                <option key={niche} value={niche} className="bg-background">
                  {niche.charAt(0).toUpperCase() + niche.slice(1)}
                </option>
              ))}
            </select>
            {errors.niche && (
              <p className="text-danger text-xs mt-1.5">
                {errors.niche.message}
              </p>
            )}
          </div>

          {/* Result Message */}
          {result && (
            <div
              className={`p-3 rounded-lg text-sm ${
                result.status === "success"
                  ? "bg-success/10 border border-success/20 text-success"
                  : "bg-danger/10 border border-danger/20 text-danger"
              }`}
            >
              {result.message}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting pipeline...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Start Scraping
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
