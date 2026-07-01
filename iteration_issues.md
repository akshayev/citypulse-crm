# Proposed Iteration Issues

This document outlines proposed features, technical debt, and architectural improvements for future iterations of the CityPulse CRM project. These issues are derived from analyzing the current state of the codebase, existing roadmap candidates, and system architecture.

## 🏗️ Architecture & Infrastructure

### 1. Robust Job Orchestration (Replace FastAPI BackgroundTasks)
**Current State:** Jobs (scraping, cleaning, scoring) are enqueued using FastAPI `BackgroundTasks`. While simple, these are ephemeral. If the FastAPI process restarts or crashes, all queued jobs are lost.
**Proposed Solution:** Integrate a dedicated task queue/orchestrator like Prefect (as suggested in README Phase 2), Celery, or Temporal. This will provide durability, scheduled runs (cron), backfill capabilities, and better run-level observability.

### 2. DLT / dbt Integration for Pipeline Transformations
**Current State:** The Medallion architecture (Bronze -> Silver -> Gold) is handled via Python code (Pydantic contracts and FastAPI routes).
**Proposed Solution:** Extract the transformation logic (Bronze to Silver to Gold) into a dedicated data transformation tool like dbt. This provides data lineage, better documentation, and easier testing of data quality rules.

### 3. Move from Supabase Anon Key to Server-Side Execution for Sensitive Reads
**Current State:** The frontend relies heavily on the Supabase anon key for fetching data (`useQuery` hooks directly to Supabase). While RLS protects this, it can expose the data schema and requires careful RLS management.
**Proposed Solution:** Route more complex or sensitive data queries through the FastAPI backend to reduce the attack surface area on the frontend and centralize business logic.

## 🧹 Technical Debt & Code Quality

### 1. Implement Comprehensive Frontend Testing
**Current State:** Frontend tests are currently missing.
**Proposed Solution:** Introduce Vitest and React Testing Library (RTL). Write tests for core components, specifically the Kanban board interactions (drag and drop), form validations, and the data-fetching hooks (mocking React Query).

### 2. Remove Selenium Fallback
**Current State:** The system falls back to Selenium if SerpApi fails. The README notes this is brittle and doesn't run well in serverless environments.
**Proposed Solution:** Remove the Selenium fallback entirely to simplify the backend footprint and container requirements. Rely on SerpApi retries or implement a more robust API-based fallback (e.g., Google Places API directly).

### 3. Consolidate Environment Variables
**Current State:** Secrets are split between `backend/.env` and `frontend/.env.local`, with some overlap (like Supabase URLs).
**Proposed Solution:** Streamline the local development environment setup, potentially using a unified `.env` structure managed by docker-compose or a tool like dotenv-vault to reduce onboarding friction.

## ✨ Product Features (CRM Enhancements)

### 1. Multi-user Support and Team Leaderboards
**Current State:** Basic RLS is in place for assigning leads to users.
**Proposed Solution:** Expand the UI to support multi-user environments fully. Add team views, the ability to assign leads to other team members, and a leaderboard on the analytics dashboard to track sales performance per rep.

### 2. Advanced Filtering and Saved Searches
**Current State:** Database schema exists for `saved_filters`, but UI support needs expansion.
**Proposed Solution:** Implement a robust query builder on the frontend allowing users to filter leads by multiple criteria (status, tags, heat score range, niche, city). Allow users to save these queries to the `saved_filters` table and quickly access them from the sidebar.

### 3. Activity Timeline UI
**Current State:** Backend triggers log status changes to the `lead_activity` table.
**Proposed Solution:** Expose this data in the UI. When clicking a lead, show an "Activity Timeline" tab displaying notes, status changes, and generated pitches chronologically, providing a complete history of interactions with the prospect.
