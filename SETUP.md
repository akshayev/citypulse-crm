# CityPulse CRM — Local Setup Guide

This guide walks you through setting up CityPulse CRM on your local machine for development and testing.

## Prerequisites

Ensure you have the following installed on your machine:
- **Python 3.11+**
- **Node.js 20+**
- **Docker & Docker Compose** (Optional, but recommended)
- **Supabase Account** (The free tier is perfectly fine)

---

## 1. Create a Supabase Project

CityPulse uses Supabase for Postgres, Auth, and Realtime.

1. Go to [Supabase](https://supabase.com) and create a new project.
2. Once provisioned, go to **Project Settings -> API** to get your:
   - Project URL
   - `anon` `public` key
   - `service_role` `secret` key
3. Go to **Project Settings -> Database** to get your:
   - Connection string (URI) for Postgres (used for running migrations)

---

## 2. Configure Environment Variables

You need to configure both the backend and frontend environment files.

### Backend (`backend/.env`)

Copy the example file and fill it out:
```bash
cd backend
cp .env.example .env
```

**Required variables:**
- `SUPABASE_URL`: Your Supabase Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase `service_role` key (NEVER expose this to the frontend)
- `BACKEND_API_KEY`: A shared secret string you make up (e.g., `my-super-secret-key-123`). This secures the backend API from unauthorized requests.
- `GEMINI_API_KEY`: Get a free key from Google AI Studio.

**Optional/Recommended variables:**
- `SERPAPI_KEY`: For the primary Google Maps scraper (the Selenium fallback is brittle).
- `GROQ_API_KEY` & `GROQ_MODEL`: For the free LLM fallback.
- `SUPABASE_DB_URL`: Postgres URI (used ONLY by the migration script).

### Frontend (`frontend/.env.local`)

Create a `.env.local` file in the `frontend/` directory:
```bash
cd frontend
cp .env.local.example .env.local  # If the example file exists, else create manually
```

**Required variables:**
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase `anon` key
- `NEXT_PUBLIC_BACKEND_URL`: URL for client-side fetches (use `http://localhost:8000` for local dev)
- `BACKEND_URL`: URL for server-side proxy (use `http://localhost:8000` for local dev, or `http://backend:8000` if using Docker)
- `BACKEND_API_KEY`: Must exactly match the key you set in the backend `.env`.

---

## 3. Database Schema Setup

Before starting the app, you need to apply the schema to your Supabase project.

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
This builds and starts both the FastAPI backend (`localhost:8000`) and the Next.js frontend (`localhost:3000`).

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
uvicorn backend.main:app --reload --port 8000
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm install
npm run dev
```

---

## 5. First Login & Admin Access

1. Open `http://localhost:3000` in your browser.
2. Sign up for a new account.
3. By default, new users get the `sales_rep` role. 
4. **To become an Admin:**
   - Go to your Supabase Dashboard -> **SQL Editor**.
   - Run the following command (replace with your email):
     ```sql
     UPDATE auth.users 
     SET app_metadata = jsonb_set(COALESCE(app_metadata, '{}'::jsonb), '{role}', '"admin"') 
     WHERE email = 'your@email.com';
     ```
   - Log out and log back in to the CRM. You will now have access to admin panels, settings, and the ability to trigger new scrapes.

---

## Troubleshooting

- **Supabase Auth/Realtime issues:** Ensure `NEXT_PUBLIC_SUPABASE_URL` and the `anon` key are correct in the frontend.
- **Scraping fails:** If SerpApi is not configured, the app falls back to Selenium. Ensure Chrome is installed if running manually. If running in Docker, the container handles this.
- **Backend rejects requests:** Verify that `BACKEND_API_KEY` matches exactly in both frontend and backend `.env` files.
