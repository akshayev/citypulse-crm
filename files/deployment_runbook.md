# CityPulse Deployment Runbook

## 1) Pre-Deploy Checklist
- Backend tests pass locally: `python -m pytest backend/tests -q -p no:cacheprovider`
- Frontend lint on touched files passes.
- Supabase SQL is applied (`project-docs/schema.sql` and `project-docs/rls_policies.sql`).
- One shared secret is generated for `BACKEND_API_KEY` and stored in both Render + Vercel.

## 2) Deploy Backend (Render)
- Create Web Service:
  - Root directory: `backend`
  - Build command: `pip install -r requirements.txt`
  - Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Set environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SERPAPI_KEY`
  - `GEMINI_API_KEY`
  - `BACKEND_API_KEY`
  - `CORS_ORIGINS` (your Vercel domain, e.g. `https://your-app.vercel.app`)
- After deploy, verify:
  - `GET https://<render-url>/api/health` returns healthy JSON.

## 3) Deploy Frontend (Vercel)
- Import repo with root directory `frontend`.
- Build command: `npm run build`
- Set environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `GEMINI_API_KEY`
  - `BACKEND_URL` (your Render URL)
  - `BACKEND_API_KEY` (same shared secret as Render)
- Deploy to production.

## 4) Production Smoke Test
- Login works and dashboard loads.
- Scrape modal:
  - Trigger one scrape and ensure accepted response (no 401).
- Analytics page:
  - Usage card loads (no 401 from `/api/usage` proxy).
- Pitch generator:
  - Successful generation increments Gemini usage.
  - At quota limit, app shows graceful 429 message (no crash).

## 5) FinOps Quota Hard-Block Validation
- Temporarily set low limits for verification:
  - Backend: `MAX_SCRAPER_RUNS_PER_DAY=1`, `MAX_GEMINI_CALLS_PER_DAY=1`
- Validate:
  - First call succeeds.
  - Second call returns `429`.
  - UI shows error state without breaking modal/page.
- Restore intended production limits after test.
