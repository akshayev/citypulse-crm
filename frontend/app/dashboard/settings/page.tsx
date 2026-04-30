"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Shield, Trash2, Ban } from "lucide-react";

interface DNCRecord {
  id: string;
  phone: string | null;
  website_domain: string | null;
  reason: string;
  blocked_at: string;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: dncList = [], isLoading } = useQuery<DNCRecord[]>({
    queryKey: ["dnc_registry"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("dnc_registry")
        .select("*")
        .order("blocked_at", { ascending: false });

      if (error) throw error;
      return data as DNCRecord[];
    },
  });

  const deleteDNC = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("dnc_registry").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from DNC list.");
      queryClient.invalidateQueries({ queryKey: ["dnc_registry"] });
    },
    onError: (err) => {
      toast.error(err.message || "Failed to remove DNC entry. You might not have admin rights.");
    },
  });

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Manage your account and CRM preferences
        </p>
      </div>

      <div className="glass-card p-6 border border-glass-border">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-bold text-text-primary">
            Do Not Contact (DNC) Registry
          </h2>
        </div>
        <p className="text-sm text-text-muted mb-6">
          Leads listed here are permanently blocked from scraping and outreach.
        </p>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <div className="spinner w-8 h-8" />
          </div>
        ) : dncList.length === 0 ? (
          <div className="text-center p-8 border border-dashed border-glass-border rounded-lg text-text-muted">
            <Ban className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>The DNC registry is empty.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-glass-border text-text-muted">
                  <th className="pb-3 px-4 font-medium">Domain / Phone</th>
                  <th className="pb-3 px-4 font-medium">Reason</th>
                  <th className="pb-3 px-4 font-medium">Blocked At</th>
                  <th className="pb-3 px-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border">
                {dncList.map((record) => (
                  <tr key={record.id} className="hover:bg-glass-hover transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-text-primary">
                        {record.website_domain || "N/A"}
                      </div>
                      <div className="text-xs text-text-muted">
                        {record.phone || "N/A"}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-text-secondary">
                      {record.reason}
                    </td>
                    <td className="py-3 px-4 text-text-secondary">
                      {format(new Date(record.blocked_at), "MMM d, yyyy")}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => deleteDNC.mutate(record.id)}
                        disabled={deleteDNC.isPending}
                        className="p-1.5 text-text-muted hover:text-danger rounded transition-colors disabled:opacity-50"
                        title="Remove from DNC"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
