/**
 * CityPulse CRM — Lead Types
 * Shared type definitions for the CRM frontend.
 */

export type LeadStatus = "new" | "contacting" | "won" | "lost";

export interface CleanedShop {
  place_id: string;
  shop_name: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  niche: string | null;
  rating: number | null;
  review_count: number;
  is_active: boolean;
}

export interface CrmLead {
  id: string;
  place_id: string;
  heat_score: number;
  reasoning: string | null;
  status: LeadStatus;
  assigned_to: string | null;
  pitch_script: string | null;
  column_order: number;
  created_at: string;
  updated_at: string;
  cleaned_shops: CleanedShop | null;
  tags: string[] | null;
}

export interface DailyApiUsage {
  date: string;
  gemini_calls: number;
  scraper_runs: number;
  gemini_limit: number;
  scraper_limit: number;
}

export interface DncEntry {
  id: string;
  phone: string | null;
  website_domain: string | null;
  reason: string | null;
  blocked_at: string;
}
