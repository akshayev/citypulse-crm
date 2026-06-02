# CityPulse CRM - Deep Analysis & Remaining Issues

Based on a deep architectural and functional analysis of the codebase, the following issues have been identified. They represent a mix of technical debt, missing configurations, missing test coverage, and deployment risks.

## 1. Security & Authentication Issues
- **Frontend Supabase Anon Key Leak/Misconfiguration**: The deployment environment currently has the `SUPABASE_SERVICE_ROLE_KEY` injected where `NEXT_PUBLIC_SUPABASE_ANON_KEY` should be. This breaks frontend auth flows (CORS/JWT Signature errors) and is a severe security vulnerability as it bypasses RLS on the client.
  - *Fix*: Create a `.env.example` in the frontend root and document the strict separation of Anon vs Service keys. Update Render environment variables immediately.
- **Missing Auth RLS Validations for API**: The FastAPI endpoints (`/api/scrape`, `/api/score`) currently authenticate via a shared static `BACKEND_API_KEY`. While functional for server-to-server webhook triggers, there is no user-level identity passed to the backend, meaning *any* user on the frontend triggers quota against the global FinOps limits, and tracking `created_by` relies entirely on frontend honesty.

## 2. Infrastructure & FinOps Risks
- **SerpApi Quota Uncapped at Provider**: The application tracks Scraper FinOps limits internally via Supabase RPC. However, if the SerpApi call in `serpapi_client.py` loops unexpectedly or is triggered manually outside the app, the internal limit is bypassed.
- **Missing Redis/In-Memory Cache**: The DLQ (Dead Letter Queue) worker in `main.py` constantly polls the Supabase database via an infinite `while True` loop (`await asyncio.sleep(60)`). This will unnecessarily consume Postgres database connections and Read IOPS.
  - *Fix*: Move the DLQ triggers to Supabase Webhooks or pg_cron, OR use a message broker like Redis.

## 3. Codebase Reliability & Test Coverage
- **Selenium Fallback Brittleness**: The Selenium fallback in `serpapi_client.py` uses hardcoded, brittle CSS selectors (`div.Nv2Ybe`, `.qBF1Pd`) which Google changes frequently. If SerpApi fails, the Selenium fallback has a 90% chance of throwing an exception because the selectors are outdated.
- **Lack of Backend Unit Tests**: Only `test_finops.py`, `test_health.py`, and `test_scraper.py` exist. There are absolutely no tests covering the Medallion architecture components:
  - `backend/ai_pipeline/cleaner.py`
  - `backend/ai_pipeline/scorer.py`
  - `backend/database/dlq.py`
- **Missing Frontend E2E Tests**: There are no Playwright or Cypress tests to verify the core value proposition of the app (the Drag and Drop Kanban interactions). If a React update breaks `dnd-kit` touch sensors, we won't know until production.

## 4. UI/UX Refinements
- **No Rate Limit Feedback on UI**: When a user clicks "Generate AI Pitch", if the backend returns a 429 Quota Exhausted, the frontend `sonner` toast correctly shows an error, but the Kanban card does not reflect a "disabled" state.
- **Next.js Static Export Limitations**: The frontend project cannot be built as a true static site (`output: "export"`) due to dynamic API routes (like `/api/usage`). This forces it to run as a Node Web Service, consuming more compute resources than a CDN-cached static frontend.
  - *Fix*: Decouple all frontend API routes into the FastAPI backend so the frontend can be a pure static SPA.

## 5. Outstanding Configuration Needs
- **Supabase CORS**: The Render frontend URL (`https://citypulse-frontend-web.onrender.com`) must be manually added to the Supabase Authentication Redirect URLs, otherwise OAuth and magic links will fail.

## 6. Real-Time Data Sync Limitations
- **Supabase Realtime Channel Misuse**: In `frontend/components/kanban/kanban-board.tsx`, the `postgres_changes` subscription on `crm_leads` immediately triggers a generic React Query invalidation (`queryClient.invalidateQueries({ queryKey: ["leads"] })`). In a multi-tenant or multi-user environment, any update by any user causes all connected clients to refetch the entire massive dataset of leads at once.
  - *Fix*: The subscription callback should read the payload from Supabase and optimistically apply *just the delta* to the React Query cache using `setQueryData`, rather than blindly refetching.

## 7. Pagination and Data Fetching Inefficiencies
- **Kanban Board Client-Side Filtering**: In the `KanbanBoard` component, search filtering is currently done entirely on the client side (`filteredLeads.filter(...)`). If the database has 1000+ leads, this requires pulling all of them to the frontend first, bypassing the benefits of server-side pagination.
  - *Fix*: Move the search logic into the Supabase query (`.ilike('shop_name', \`%${searchQuery}%\`)`) so pagination (`limit(50)`) operates on the actual filtered dataset rather than a subset of the first 50 returned.

## 8. Hardcoded Defaults & Magic Strings
- **Config Hardcodes**: The Fastapi `config.py` hardcodes the backend fallback API key (`dev-secret-key-123`) directly in the `Settings` class default. This acts as a backdoor if the environment variable fails to load.
- **Frontend URL Guessing**: The Next.js API routes (`app/api/usage/route.ts` and `app/api/scrape/route.ts`) have a hardcoded `http://localhost:8000` fallback if `BACKEND_URL` is missing. This can cause silent failures where Next.js attempts to reach localhost in a deployed environment instead of throwing a fast configuration error.
