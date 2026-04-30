# Final Deployment & Validation Execution Guide

Follow these steps sequentially to go live and verify the CityPulse CRM.

## Step 1: Backend Deployment (Render)
1.  **Preparation**: Ensure you have all keys ready (Supabase, SerpApi, Gemini).
2.  **Generate `BACKEND_API_KEY`**: Generate a secure string (e.g., `openssl rand -base64 32`). Save it safely.
3.  **Create Render Web Service**:
    *   **Root Directory**: `backend`
    *   **Build Command**: `pip install -r requirements.txt`
    *   **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
4.  **Set Environment Variables**:
    *   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SERPAPI_KEY`, `GEMINI_API_KEY`
    *   `BACKEND_API_KEY` (The shared secret generated in #2)
    *   `CORS_ORIGINS`: Set this to `*` initially for testing, then restrict to your Vercel URL once known.
5.  **Verify**: Access `https://<your-render-url>/api/health`.

## Step 2: Frontend Deployment (Vercel)
1.  **Preparation**: Get your Render URL from Step 1.
2.  **Create Vercel Project**:
    *   **Root Directory**: `frontend`
    *   **Framework Preset**: Next.js
3.  **Set Environment Variables**:
    *   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    *   `GEMINI_API_KEY`
    *   `BACKEND_URL`: `https://<your-render-url>`
    *   `BACKEND_API_KEY`: (Must match Step 1.2)
4.  **Deploy**: Run the build and deploy.

## Step 3: Smoke Tests & FinOps Validation
Once both are live, perform these checks:
1.  **Auth Check**: Log in to your Vercel URL. Ensure you reach the dashboard.
2.  **Scrape Test**: Trigger a new scrape. Check the "New" column for results.
3.  **Pitch Test**: Click a lead -> AI Pitch. Ensure it streams correctly.
4.  **Quota Verification**:
    *   Go to the **Analytics** page.
    *   Verify "Gemini AI Calls" and "Scraper Runs" show accurate data.
5.  **Hard-Block Test (Recommended)**:
    *   Temporarily set `MAX_GEMINI_CALLS_PER_DAY=1` in Render environment variables.
    *   Generate one pitch (success).
    *   Generate a second pitch (should show a red Toast/Modal error: "429 Quota Exhausted").
    *   Restore Render limit to production value (e.g., `50`).

## Step 4: Final Cleanup
1.  **Update CORS**: Change `CORS_ORIGINS` in Render from `*` to your exact `https://<your-app>.vercel.app`.
2.  **Registry**: Ensure the `DNC Registry` in Settings is visible and records blocked leads correctly.
