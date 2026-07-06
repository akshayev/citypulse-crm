<![CDATA[<div align="center">

# ⚡ CityPulse CRM

**AI-Powered Lead Generation CRM with a Medallion Data Pipeline**

[![CI](https://github.com/akshayev/citypulse-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/akshayev/citypulse-crm/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres+Auth+Realtime-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An event-driven, AI-enriched lead-generation CRM built around a **Bronze → Silver → Gold medallion data pipeline**. Scrapes local-business data, cleans & compliance-filters it, scores each lead 0–100 with an LLM, and serves it to a real-time sales Kanban board.

[Features](#-features) · [Quick Start](#-quick-start) · [Architecture](#-architecture) · [API Reference](#-api-reference) · [Contributing](#-contributing)

</div>

---

## 📖 Overview

CityPulse CRM is a **data-engineering portfolio project** that demonstrates a complete pipeline from raw data ingestion through quality gates and AI enrichment to a production-ready sales interface. The interesting part is not just the CRM UI — it's the *pipeline* architecture, its **resilience** (dead-letter queue, provider fallbacks), and its **cost controls** (FinOps quotas).

### The Heat Score Thesis

> A local business with **no website**, **poor SEO**, or **low ratings** is a hot lead for digital/marketing services. CityPulse scores this automatically with AI.

### How it Works

1. An admin triggers a **scrape** for a `city` + `niche` (e.g. "restaurants in Kochi")
2. The backend pulls business listings via SerpApi (with a best-effort Selenium fallback) → **Bronze**
3. Data is **cleaned**, normalized, and filtered against a Do-Not-Contact registry → **Silver**
4. An LLM assigns each business a **Heat Score (0–100)** with reasoning → **Gold**
5. Scored leads stream into a **real-time Kanban board**; reps drag leads through `new → contacting → won / lost` and generate AI cold-outreach pitches

---

## ✨ Features

### Pipeline & Data Engineering
- 🏗️ **Medallion Architecture** — Bronze → Silver → Gold with immutable audit records
- 🧹 **Data Quality Gates** — Pydantic contracts (`CleanedShop`, `ScoredLead`) at each layer; bad rows are quarantined, never written downstream
- 🤖 **AI Lead Scoring** — Gemini 2.5 Flash primary + Groq Llama-3.3-70B free fallback
- 💀 **Dead Letter Queue** — Failed tasks auto-retry with exponential backoff (30s → 480s, max 5 retries)
- 💰 **FinOps Quotas** — Atomic Postgres RPCs cap daily Gemini calls and scraper runs
- 🔄 **Provider Fallbacks** — Gemini → Groq on LLM errors; SerpApi → Selenium on scraper failure
- 📊 **Pipeline Observability** — Per-run metrics, LLM token/cost tracking, `/api/metrics` endpoint

### CRM & Product
- 📋 **Real-time Kanban Board** — Drag-and-drop with optimistic UI updates via Supabase Realtime
- ✉️ **AI Pitch Generator** — Streaming cold-outreach scripts with Gemini/Groq
- 🏷️ **Lead Tags & Bulk Actions** — Multi-select leads, bulk status changes, tag management
- 📝 **Activity Timeline** — Per-lead notes and activity history
- 🔍 **Saved Filters & Search** — Persistent filter presets across sessions
- 📤 **CSV Export** — Export filtered leads with one click
- 📈 **Analytics Dashboard** — Pipeline funnel visualization + FinOps budget meter
- 🛡️ **DNC Registry** — Do-Not-Contact compliance management in Settings

### Platform & Security
- 🔐 **Row-Level Security** — RLS on every table; admin role via `app_metadata` (server-set only)
- 🔑 **Auth** — Supabase email/password with password reset, email confirmation, account page
- 🚦 **Rate Limiting** — Per-route burst caps via SlowAPI
- 🏥 **Health Probes** — Liveness (`/api/health`) + Readiness (`/api/health/ready`) endpoints
- 🐛 **Error Tracking** — Sentry integration (opt-in, DSN-gated)
- ♿ **Accessibility** — Modal focus traps, Escape key support, `prefers-reduced-motion`
- 🐳 **Docker** — One-command `docker compose up` with seed data

---

## 🏗 Architecture

```mermaid
flowchart LR
    subgraph Client["Frontend — Next.js (Vercel)"]
        UI["Kanban / Pitch / Analytics / Settings"]
        MW["Edge middleware (auth)"]
        API["Route handlers /api/* (auth-gated proxy)"]
    end

    subgraph Backend["Backend — FastAPI"]
        EP["/api/scrape, /api/score, /api/usage"]
        PIPE["Pipeline orchestrator (BackgroundTasks)"]
        DLQ["DLQ retry worker (60s loop)"]
    end

    subgraph Ext["External"]
        SERP["SerpApi / Selenium"]
        LLM["Gemini 2.5 Flash + Groq fallback"]
    end

    subgraph DB["Supabase (Postgres + Auth + Realtime)"]
        B[("Bronze: raw_scrapes")]
        S[("Silver: cleaned_shops")]
        G[("Gold: crm_leads")]
        SYS[("dnc_registry / daily_api_usage / dlq_tasks")]
    end

    UI --> MW --> API --> EP
    UI <-. realtime .-> G
    EP --> PIPE
    PIPE --> SERP --> B --> S --> G
    PIPE --> LLM
    DLQ --> SYS
    PIPE --> SYS
```

**Two deployables:** the **frontend** (Next.js → Vercel) and the **backend** (FastAPI → container host). The frontend never talks to external scrapers/LLMs for pipeline work — it proxies to the backend, which holds the privileged keys.

### Data Flow: Bronze → Silver → Gold

| Layer | Table | Produced by | Responsibility |
|-------|-------|-------------|----------------|
| **Bronze** | `raw_scrapes` | `scraper/serpapi_client.py` | Capture raw scrape JSON verbatim — immutable audit record |
| **Silver** | `cleaned_shops` | `ai_pipeline/cleaner.py` | Normalize phone/website, DNC compliance filter, data-quality gate (`CleanedShop` contract) |
| **Gold** | `crm_leads` | `ai_pipeline/scorer.py` | LLM heat-score + reasoning, DQ gate (`ScoredLead` contract), idempotent upsert on `place_id` |

Orchestrated by `_run_full_pipeline` in `backend/main.py`. Any step that fails goes to the **Dead Letter Queue** instead of crashing the pipeline.

---

## 🛠 Tech Stack

| Area | Technology |
|------|-----------|
| **Backend** | Python 3.11, FastAPI 0.115, Uvicorn, Pydantic v2, pydantic-settings |
| **Frontend** | Next.js 16, React 19, TypeScript 5, Turbopack |
| **UI** | Tailwind CSS 4, dnd-kit (drag/drop), TanStack Query, Zustand, react-hook-form + Zod, Sonner (toasts), Lucide icons |
| **Database** | Supabase (Postgres + Auth + Realtime), Row-Level Security, PL/pgSQL RPCs |
| **Scraping** | SerpApi (primary), Selenium headless (best-effort fallback) |
| **LLM** | Google Gemini 2.5 Flash (primary) + Groq Llama-3.3-70B (free fallback) |
| **Reliability** | Tenacity retries, SlowAPI rate limits, Sentry error tracking |
| **CI/CD** | GitHub Actions (lint, build, Black, pytest), Vercel preview deploys |
| **Infra** | Docker, Docker Compose, Makefile |

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 20+ |
| Supabase project | Free tier works |

### Option A: Docker (Recommended)

```bash
# 1. Clone the repo
git clone https://github.com/akshayev/citypulse-crm.git
cd citypulse-crm

# 2. Configure environment
cp backend/.env.example backend/.env      # Fill in your Supabase + API keys
# Create frontend/.env.local with Supabase anon key + backend URL (see Environment Variables below)

# 3. Apply database schema to your Supabase project
#    Run project-docs/schema.sql → rls_policies.sql in the Supabase SQL Editor
#    Then apply migrations:
SUPABASE_DB_URL=postgresql://... python scripts/run_migrations.py

# 4. Start everything
make up                                   # Backend → :8000, Frontend → :3000

# 5. (Optional) Load demo data
make seed
```

### Option B: Manual Setup

```bash
# 1. Backend
cd backend
python3.11 -m venv ../.venv && source ../.venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                      # Fill in values

# 2. Apply DB schema (same as above)

# 3. Run backend (from repo root)
uvicorn backend.main:app --reload         # http://localhost:8000/api/health

# 4. Frontend (new terminal)
cd frontend
npm install
# Create .env.local (see Environment Variables below)
npm run dev                               # http://localhost:3000
```

### First Login

Log in with an admin account. The admin role must be set in `app_metadata` via the Supabase service role — new users default to `sales_rep`. See [Security Model](#-security-model) for details.

---

## 📁 Project Structure

```
citypulse-crm/
├── backend/
│   ├── main.py                         # FastAPI app, endpoints, DLQ worker, pipeline orchestrator
│   ├── config.py                       # pydantic-settings (env vars), prod secret guard
│   ├── observability.py                # Sentry init + structured logging
│   ├── retry.py                        # Tenacity retry utilities
│   ├── scraper/
│   │   └── serpapi_client.py           # SerpApi + Selenium fallback (Bronze)
│   ├── ai_pipeline/
│   │   ├── cleaner.py                  # Silver: normalize + DNC + DQ gate
│   │   ├── scorer.py                   # Gold: Gemini/Groq scoring + DQ gate + upsert
│   │   └── contracts.py               # Pydantic data contracts (CleanedShop, ScoredLead)
│   ├── database/
│   │   ├── supabase_client.py          # Supabase client singleton
│   │   ├── finops.py                   # FinOps quota management
│   │   ├── dlq.py                      # Dead Letter Queue operations
│   │   ├── runs.py                     # Pipeline run tracking
│   │   └── metrics.py                  # Pipeline metrics aggregation
│   ├── tests/                          # pytest (12 test files)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── (auth)/                     # login, signup, forgot-password, reset-password
│   │   ├── dashboard/                  # Kanban board, analytics, settings, account
│   │   ├── api/                        # Auth-gated route handlers (scrape, usage, generate-pitch, metrics, dlq)
│   │   ├── layout.tsx                  # Root layout with providers
│   │   ├── page.tsx                    # Landing page
│   │   ├── error.tsx                   # Global error boundary
│   │   └── globals.css                 # Design system tokens
│   ├── components/
│   │   ├── kanban/                     # Board, card, column, pitch generator, modal, bulk toolbar, filters, export
│   │   ├── forms/                      # Reusable form components
│   │   ├── jobs/                       # Active jobs panel
│   │   └── providers/                  # React Query, Supabase providers
│   ├── lib/                            # Supabase clients, auth helpers, CSV export, types, utilities
│   ├── store/                          # Zustand state management
│   ├── middleware.ts                   # Edge auth middleware
│   ├── Dockerfile
│   └── package.json
├── project-docs/
│   ├── schema.sql                      # Canonical database DDL (from-scratch reference)
│   ├── rls_policies.sql                # Row-Level Security policies
│   └── RUNBOOK.md                      # Operational runbook (probes, Sentry, backups, key rotation)
├── supabase/migrations/                # Incremental SQL migrations (tracked by scripts/run_migrations.py)
├── scripts/run_migrations.py           # Migration runner with --status and --baseline flags
├── .github/workflows/
│   ├── ci.yml                          # CI: lint, build, Black, pytest
│   └── backup.yml                      # Daily pg_dump → artifact (02:00 UTC)
├── docker-compose.yml                  # One-command local stack
├── Makefile                            # build, up, down, logs, seed, test
└── pytest.ini
```

---

## 💾 Data Model

```
raw_scrapes (Bronze)
  id PK · raw_data JSONB · city · niche · source · scraped_at · created_by→auth.users

cleaned_shops (Silver)
  place_id PK · shop_name · phone · website · address · city · niche
  · lat_lng POINT · rating(0-5) · review_count · is_active · raw_scrape_id→raw_scrapes

crm_leads (Gold)
  id PK · place_id UNIQUE →cleaned_shops · heat_score(0-100) · reasoning
  · status(new|contacting|won|lost) · assigned_to→auth.users · pitch_script
  · tags TEXT[] · column_order · created_at · updated_at

─── Supporting Tables ───
dnc_registry        phone UNIQUE · website_domain UNIQUE · reason         (compliance blocklist)
daily_api_usage     date PK · gemini_calls · scraper_runs                 (FinOps counters)
dlq_tasks           task_id PK · task_type · payload JSONB · retry_count · status · next_retry_at
pipeline_runs       id PK · city · niche · status · bronze/silver/gold counts · LLM cost tracking
pipeline_metrics    Aggregated pipeline performance metrics
lead_notes          Per-lead activity timeline entries
saved_filters       User-scoped persistent filter presets
schema_migrations   Migration tracker for scripts/run_migrations.py
```

**Functions & Triggers:** `is_admin()`, `increment_gemini_calls()` / `increment_scraper_runs()` (atomic RPCs), `set_default_app_role()` (defaults new users to `sales_rep`), `update_updated_at_column()`.

Canonical DDL: [`project-docs/schema.sql`](project-docs/schema.sql) + [`project-docs/rls_policies.sql`](project-docs/rls_policies.sql). Incremental changes: [`supabase/migrations/`](supabase/migrations/).

---

## 🔒 Security Model

| Layer | Implementation |
|-------|---------------|
| **Authentication** | Supabase email/password. Edge middleware guards `/dashboard`; API route handlers require a valid session. |
| **Authorization** | RLS on every table. Admin = `app_metadata.role == 'admin'` (server-set only — closes self-promotion). Sales reps see assigned + unassigned leads. |
| **Secrets** | Service-role key → backend only; anon key → browser; `BACKEND_API_KEY` → server-side proxy. Prod refuses to boot with default/blank keys. |
| **Rate Limiting** | Per-route burst caps via SlowAPI (configurable via env). Global daily FinOps quotas are the durable guard. |
| **Compliance** | DNC registry cross-checked at Silver layer; blocked leads never advance to Gold. |
| **Body Size** | 64 KB max request body enforced before routing (configurable). |

---
