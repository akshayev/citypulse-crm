"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { rowsToCsv, downloadCsv } from "@/lib/csv";

interface ExportRow {
  heat_score: number;
  status: string;
  reasoning: string | null;
  tags: string[] | null;
  created_at: string;
  cleaned_shops: {
    shop_name: string | null;
    phone: string | null;
    website: string | null;
    address: string | null;
    city: string | null;
    rating: number | null;
    review_count: number | null;
  } | null;
}

const HEADERS = [
  "Shop Name",
  "Phone",
  "Website",
  "Address",
  "City",
  "Rating",
  "Reviews",
  "Heat Score",
  "Status",
  "Tags",
  "Reasoning",
  "Created At",
];

const EXPORT_LIMIT = 5000;

/** Exports the leads the user can see (RLS-scoped) to a CSV (D3). */
export function ExportButton() {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_leads")
        .select(
          "heat_score,status,reasoning,tags,created_at,cleaned_shops(shop_name,phone,website,address,city,rating,review_count)"
        )
        .order("created_at", { ascending: false })
        .limit(EXPORT_LIMIT);

      if (error) throw error;
      const leads = (data ?? []) as unknown as ExportRow[];

      if (leads.length === 0) {
        toast.info("No leads to export.");
        return;
      }

      const rows = leads.map((l) => {
        const s = l.cleaned_shops;
        return [
          s?.shop_name,
          s?.phone,
          s?.website,
          s?.address,
          s?.city,
          s?.rating,
          s?.review_count,
          l.heat_score,
          l.status,
          l.tags,
          l.reasoning,
          l.created_at,
        ];
      });

      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`citypulse-leads-${stamp}.csv`, rowsToCsv(HEADERS, rows));
      const capped = leads.length === EXPORT_LIMIT ? ` (capped at ${EXPORT_LIMIT})` : "";
      toast.success(`Exported ${leads.length} leads${capped}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={busy}
      className="btn-ghost flex items-center gap-2 text-sm disabled:opacity-50"
    >
      {busy ? <span className="spinner" /> : <Download className="w-4 h-4" />}
      Export CSV
    </button>
  );
}
