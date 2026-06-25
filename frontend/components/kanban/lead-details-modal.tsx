"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useKanbanStore } from "@/store/kanban-store";
import { X, MapPin, Phone, Globe, Star, Clock, Flame, Calendar } from "lucide-react";
import { format } from "date-fns";
import { formatPhone } from "@/lib/utils";
import { useModalA11y } from "@/lib/hooks/use-modal-a11y";

export function LeadDetailsModal() {
  const { leadDetailId, closeLeadDetail } = useKanbanStore();
  const dialogRef = useModalA11y<HTMLDivElement>(!!leadDetailId, closeLeadDetail);

  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead-details", leadDetailId],
    queryFn: async () => {
      if (!leadDetailId) return null;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_leads")
        .select(`
          *,
          cleaned_shops (*)
        `)
        .eq("id", leadDetailId)
        .single();
        
      if (error) throw error;
      return data;
    },
    enabled: !!leadDetailId,
  });

  if (!leadDetailId) return null;

  const shop = lead?.cleaned_shops;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto"
      onClick={closeLeadDetail}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Lead details"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-2xl p-6 flex flex-col max-h-[95vh] my-auto relative outline-none"
      >
        <button
          onClick={closeLeadDetail}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-glass-hover transition-colors"
        >
          <X className="w-5 h-5 text-text-muted hover:text-text-primary" />
        </button>

        {isLoading ? (
          <div className="flex justify-center items-center h-48">
            <div className="spinner w-8 h-8" />
          </div>
        ) : !lead ? (
          <div className="text-center text-text-muted p-8">Lead not found.</div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2">
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-text-primary mb-2">
                {shop?.shop_name || "Unknown Business"}
              </h2>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="px-2.5 py-1 rounded-full bg-accent/10 text-accent font-medium flex items-center gap-1.5">
                  <Flame className="w-4 h-4" /> Heat: {lead.heat_score}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-glass-bg border border-glass-border text-text-secondary flex items-center gap-1.5 capitalize">
                  Status: {lead.status}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-glass-bg border border-glass-border text-text-secondary flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" /> Added: {format(new Date(lead.created_at), "MMM d, yyyy")}
                </span>
              </div>
            </div>

            {/* AI Reasoning */}
            {lead.reasoning && (
              <div className="mb-6 bg-accent/5 border border-accent/20 rounded-lg p-4">
                <h3 className="text-xs font-bold text-accent uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Flame className="w-3.5 h-3.5" /> AI Analysis
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed italic">
                  &quot;{lead.reasoning}&quot;
                </p>
              </div>
            )}

            {/* Shop Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Contact Info */}
              <div className="space-y-4 glass-card p-4 bg-background/50">
                <h3 className="text-sm font-semibold text-text-primary border-b border-glass-border pb-2 mb-3">
                  Contact Information
                </h3>
                
                {shop?.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-text-muted mt-0.5" />
                    <div>
                      <p className="text-xs text-text-muted mb-0.5">Phone</p>
                      <p className="text-sm font-medium text-text-primary">{formatPhone(shop.phone)}</p>
                    </div>
                  </div>
                )}
                
                {shop?.website && (
                  <div className="flex items-start gap-3">
                    <Globe className="w-4 h-4 text-text-muted mt-0.5" />
                    <div>
                      <p className="text-xs text-text-muted mb-0.5">Website</p>
                      <a href={shop.website.startsWith('http') ? shop.website : `https://${shop.website}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-accent hover:underline break-all">
                        {shop.website}
                      </a>
                    </div>
                  </div>
                )}
                
                {shop?.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-text-muted mt-0.5" />
                    <div>
                      <p className="text-xs text-text-muted mb-0.5">Address</p>
                      <p className="text-sm font-medium text-text-primary">{shop.address}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Reputation & Metadata */}
              <div className="space-y-4 glass-card p-4 bg-background/50">
                <h3 className="text-sm font-semibold text-text-primary border-b border-glass-border pb-2 mb-3">
                  Reputation & Details
                </h3>

                {(shop?.rating !== null) && (
                  <div className="flex items-start gap-3">
                    <Star className="w-4 h-4 text-warning mt-0.5" />
                    <div>
                      <p className="text-xs text-text-muted mb-0.5">Google Rating</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-text-primary">{shop.rating} / 5.0</span>
                        <span className="text-xs text-text-muted">({shop.review_count} reviews)</span>
                      </div>
                    </div>
                  </div>
                )}

                {shop?.business_status && (
                  <div className="flex items-start gap-3">
                    <Clock className="w-4 h-4 text-text-muted mt-0.5" />
                    <div>
                      <p className="text-xs text-text-muted mb-0.5">Business Status</p>
                      <p className="text-sm font-medium text-text-primary">{shop.business_status}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Raw Extracted Data (optional) */}
            {shop?.raw_json && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">
                  Raw Extracted Data
                </h3>
                <pre className="text-xs p-4 bg-background rounded-lg border border-glass-border overflow-x-auto text-text-secondary whitespace-pre-wrap">
                  {JSON.stringify(shop.raw_json, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
