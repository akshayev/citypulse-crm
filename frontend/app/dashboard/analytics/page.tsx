"use client";

export const dynamic = "force-dynamic";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart3,
  Flame,
  Users,
  Zap,
  TrendingUp,
  AlertTriangle,
  Activity,
} from "lucide-react";

/**
 * Admin Analytics Dashboard
 * Shows total leads, leads by status, API usage, and budget meter.
 */
export default function AnalyticsPage() {
  // Fetch leads for stats
  const { data: leads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("crm_leads")
        .select("id, heat_score, status");
      return data || [];
    },
  });

  // Fetch API usage
  const { data: usage } = useQuery({
    queryKey: ["api-usage"],
    queryFn: async () => {
      const res = await fetch("/api/usage");
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Pipeline observability metrics (funnel, cost, provider split)
  const { data: metrics } = useQuery({
    queryKey: ["pipeline-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/metrics");
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Dead-letter queue health
  const { data: dlq } = useQuery({
    queryKey: ["dlq-status"],
    queryFn: async () => {
      const res = await fetch("/api/dlq/status");
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 30000,
  });

  const totalLeads = leads.length;
  const newLeads = leads.filter((l) => l.status === "new").length;
  const contactingLeads = leads.filter((l) => l.status === "contacting").length;
  const wonLeads = leads.filter((l) => l.status === "won").length;
  const lostLeads = leads.filter((l) => l.status === "lost").length;
  const avgHeatScore =
    totalLeads > 0
      ? Math.round(
          leads.reduce((sum, l) => sum + (l.heat_score || 0), 0) / totalLeads
        )
      : 0;

  const geminiUsage = usage?.gemini_calls || 0;
  const geminiLimit = usage?.gemini_limit || 50;
  const geminiPercent = Math.round((geminiUsage / geminiLimit) * 100);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Analytics</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Overview of your CRM performance and API usage
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Leads"
          value={totalLeads}
          color="text-info"
        />
        <StatCard
          icon={Flame}
          label="Avg Heat Score"
          value={avgHeatScore}
          color="text-warning"
        />
        <StatCard
          icon={TrendingUp}
          label="Won Deals"
          value={wonLeads}
          color="text-success"
        />
        <StatCard
          icon={AlertTriangle}
          label="Lost"
          value={lostLeads}
          color="text-danger"
        />
      </div>

      {/* Pipeline Breakdown */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-accent" />
          Pipeline Breakdown
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <PipelineBar label="New" count={newLeads} total={totalLeads} color="bg-info" />
          <PipelineBar
            label="Contacting"
            count={contactingLeads}
            total={totalLeads}
            color="bg-warning"
          />
          <PipelineBar label="Won" count={wonLeads} total={totalLeads} color="bg-success" />
          <PipelineBar label="Lost" count={lostLeads} total={totalLeads} color="bg-danger" />
        </div>
      </div>

      {/* API Usage / FinOps Budget Meter */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent" />
          API Budget (Today)
        </h2>

        <div className="space-y-4">
          {/* Gemini Usage */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-text-secondary">Gemini AI Calls</span>
              <span className="text-text-primary font-mono">
                {geminiUsage}/{geminiLimit}
              </span>
            </div>
            <div className="h-2.5 bg-glass-bg rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  geminiPercent >= 90
                    ? "bg-danger"
                    : geminiPercent >= 70
                    ? "bg-warning"
                    : "bg-accent"
                }`}
                style={{ width: `${Math.min(geminiPercent, 100)}%` }}
              />
            </div>
            {geminiPercent >= 90 && (
              <p className="text-xs text-danger mt-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {geminiPercent >= 100
                  ? "Quota exhausted — AI features disabled"
                  : "Approaching daily limit"}
              </p>
            )}
          </div>

          {/* Scraper Usage */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-text-secondary">Scraper Runs</span>
              <span className="text-text-primary font-mono">
                {usage?.scraper_runs || 0}/{usage?.scraper_limit || 20}
              </span>
            </div>
            <div className="h-2.5 bg-glass-bg rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{
                  width: `${Math.min(
                    ((usage?.scraper_runs || 0) / (usage?.scraper_limit || 20)) *
                      100,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Health / Observability (last N days) */}
      <div className="glass-card p-6">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          Pipeline Health (last {metrics?.window_days ?? 30} days)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <MiniStat
            label="Pipeline Runs"
            value={`${metrics?.totals?.runs ?? 0}`}
            sub={`${metrics?.totals?.runs_failed ?? 0} failed`}
          />
          <MiniStat
            label="Bronze → Silver"
            value={`${metrics?.funnel?.bronze_to_silver_pct ?? 0}%`}
            sub={`${metrics?.totals?.silver ?? 0} / ${metrics?.totals?.bronze ?? 0}`}
          />
          <MiniStat
            label="Silver → Gold"
            value={`${metrics?.funnel?.silver_to_gold_pct ?? 0}%`}
            sub={`${metrics?.totals?.gold ?? 0} leads`}
          />
          <MiniStat
            label="LLM Cost"
            value={`$${(Number(metrics?.totals?.llm_cost_usd) || 0).toFixed(4)}`}
            sub={`$${metrics?.cost_per_1k_leads_usd ?? 0} / 1k leads`}
          />
          <MiniStat
            label="Gemini / Groq"
            value={`${metrics?.provider_split?.gemini_pct ?? 0}% / ${metrics?.provider_split?.groq_pct ?? 0}%`}
            sub={`${metrics?.totals?.gemini_calls ?? 0} + ${metrics?.totals?.groq_calls ?? 0} calls`}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-secondary">
          <span>
            DNC blocked:{" "}
            <b className="text-text-primary">{metrics?.totals?.blocked ?? 0}</b>
          </span>
          <span>
            DQ rejected:{" "}
            <b className="text-text-primary">{metrics?.totals?.dq_failed ?? 0}</b>
          </span>
          <span>
            DLQ pending:{" "}
            <b className="text-warning">{dlq?.by_status?.pending ?? 0}</b>
          </span>
          <span>
            DLQ retrying:{" "}
            <b className="text-info">{dlq?.by_status?.retrying ?? 0}</b>
          </span>
          <span>
            DLQ failed: <b className="text-danger">{dlq?.by_status?.failed ?? 0}</b>
          </span>
          <span>
            DLQ resolved:{" "}
            <b className="text-success">{dlq?.by_status?.resolved ?? 0}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="glass-card p-4">
      <p className="text-lg font-bold text-text-primary">{value}</p>
      <p className="text-xs text-text-secondary">{label}</p>
      {sub && <p className="text-[10px] text-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-glass-bg ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-2xl font-bold text-text-primary">{value}</p>
          <p className="text-xs text-text-secondary">{label}</p>
        </div>
      </div>
    </div>
  );
}

function PipelineBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="text-center">
      <p className="text-lg font-bold text-text-primary">{count}</p>
      <p className="text-xs text-text-secondary mb-2">{label}</p>
      <div className="h-1.5 bg-glass-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-text-muted mt-1">{percent}%</p>
    </div>
  );
}
