# CityPulse CRM — Advanced Local Setup Guide

This guide walks you through setting up CityPulse CRM on your local machine for development and testing. It includes the reasoning behind the architectural choices and configuration steps to help you understand *why* the setup is structured this way.

## Prerequisites

Ensure you have the following installed on your machine:
- **Python 3.11+**: The backend uses modern Python features (like advanced typing and `asyncio` improvements in 3.11+) essential for FastAPI and the concurrent Medallion pipeline.
- **Node.js 20+**: Required for Next.js 16 and React 19, taking advantage of the latest Node performance improvements.
- **Docker & Docker Compose** (Optional, but recommended): Ensures consistent environments between development and production, encapsulating dependencies like Selenium/Chrome.
- **Supabase Account**: (The free tier is perfectly fine). We use Supabase as our unified Backend-as-a-Service for PostgreSQL, Authentication, and Realtime WebSocket events.

---

## 1. Create a Supabase Project

CityPulse uses Supabase as its core database and auth provider.

**Why Supabase?** It gives us a robust Postgres database with Row-Level Security (RLS) built-in, out-of-the-box authentication, and real-time database subscriptions (vital for our live Kanban board).

1. Go to [Supabase](https://supabase.com) and create a new project.
2. Once provisioned, go to **Project Settings -> API** to get your:
   - Project URL
   - `anon` `public` key (Safe for the frontend to use).
   - `service_role` `secret` key (Powerful admin key—**NEVER** expose this to the frontend).
3. Go to **Project Settings -> Database** to get your:
   - Connection string (URI) for Postgres (used for running migrations directly against the database).

---

## 2. Configure Environment Variables

We use two separate `.env` files. **Why separate?** The frontend and backend run in different environments and have different security profiles. The frontend runs in the user's browser, meaning any variable exposed there is public. The backend runs on a secure server, holding sensitive keys (like LLM API keys and the Supabase Service Role key) that must never reach the client.

### Backend (`backend/.env`)

Copy the example file and fill it out:
```bash
cd backend
cp .env.example .env
```

**Required variables:**
- `SUPABASE_URL`: Your Supabase Project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase `service_role` key. The backend needs this to bypass RLS for administrative tasks (like updating FinOps quotas or managing DLQ tasks).
- `BACKEND_API_KEY`: A shared secret string you make up (e.g., `my-super-secret-key-123`).
  - **Reasoning:** Since the backend exposes public endpoints (like `/api/scrape`), we need to ensure only *our* frontend can call them. The Next.js API routes proxy requests to the backend and attach this key.
- `GEMINI_API_KEY`: Get a free key from Google AI Studio. Used for the Gold layer (lead scoring) and pitch generation.

**Optional/Recommended variables:**
- `SERPAPI_KEY`: For the primary Google Maps scraper. (The Selenium fallback is brittle and resource-intensive).
- `GROQ_API_KEY` & `GROQ_MODEL`: For the free LLM fallback if Gemini fails or rate-limits us.
- `SUPABASE_DB_URL`: Postgres URI (used ONLY by the migration script).

### Frontend (`frontend/.env.local`)

Create a `.env.local` file in the `frontend/` directory:
```bash
cd frontend
cp .env.local.example .env.local  # If the example file exists, else create manually
```

**Required variables:**
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase Project URL. (Safe for client).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase `anon` key. (Safe for client; protected by RLS rules in Postgres).
- `NEXT_PUBLIC_BACKEND_URL`: URL for client-side fetches.
- `BACKEND_URL`: URL for server-side proxy (use `http://localhost:8000` for local dev, or `http://backend:8000` if using Docker).
- `BACKEND_API_KEY`: Must exactly match the key you set in the backend `.env`.
  - **Reasoning:** When the frontend client needs to talk to the FastAPI backend, it actually calls a Next.js Route Handler (e.g., `/api/scrape`). The Next.js server then attaches this `BACKEND_API_KEY` and forwards the request to FastAPI, keeping the key hidden from the browser.

---

## 3. Database Schema Setup

Before starting the app, you need to apply the schema to your Supabase project. This sets up the tables for our Medallion architecture (Bronze, Silver, Gold), the DLQ, and RLS policies.

### Option A: Via Python Migration Script (Recommended)
From the root of the project:
```bash
# Ensure SUPABASE_DB_URL is set in backend/.env, or pass it inline:
SUPABASE_DB_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres" python scripts/run_migrations.py
```

### Option B: Via Supabase SQL Editor
1. Go to the SQL Editor in your Supabase Dashboard.
2. Paste and run the contents of `project-docs/schema.sql`.
3. Paste and run the contents of `project-docs/rls_policies.sql`.

---

## 4. Running the Application

### Option A: Docker Compose (Easiest)

From the project root:
```bash
make up
```
This builds and starts both the FastAPI backend (`localhost:8000`) and the Next.js frontend (`localhost:3000`). It automatically handles networking between the containers.

To seed the database with demo data:
```bash
make seed
```

### Option B: Manual Setup

If you prefer to run the services natively without Docker:

**Terminal 1 (Backend):**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000 &
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm install
npm run dev &
```

---

## 5. First Login & Admin Access

1. Open `http://localhost:3000` in your browser.
2. Sign up for a new account. Supabase Auth handles the secure storage of credentials.
3. By default, new users get the `sales_rep` role. 
4. **To become an Admin:**
   - Go to your Supabase Dashboard -> **SQL Editor**.
   - Run the following command (replace with your email):
     ```sql
     UPDATE auth.users 
     SET app_metadata = jsonb_set(COALESCE(app_metadata, '{}'::jsonb), '{role}', '"admin"') 
     WHERE email = 'your@email.com';
     ```
   - **Reasoning:** We store the role in `app_metadata` rather than a standard Postgres table because `app_metadata` is embedded directly into the user's JWT (JSON Web Token). This allows Supabase RLS policies to check the user's role instantly without needing a slow secondary database lookup on every query.
   - Log out and log back in to the CRM. You will now have access to admin panels, settings, and the ability to trigger new scrapes.

---

## Troubleshooting

- **Supabase Auth/Realtime issues:** Ensure `NEXT_PUBLIC_SUPABASE_URL` and the `anon` key are correct in the frontend.
- **Scraping fails:** If SerpApi is not configured, the app falls back to Selenium. Ensure Chrome is installed if running manually. If running in Docker, the container handles this.
- **Backend rejects requests:** Verify that `BACKEND_API_KEY` matches exactly in both frontend and backend `.env` files. This is the most common cause of 401/403 errors when the UI tries to trigger a scrape.
