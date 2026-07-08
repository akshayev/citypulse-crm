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

## 🔗 API Reference

All endpoints (except health) require `X-API-Key` header authentication.

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| `GET` | `/api/health` | Liveness probe (no auth) | — |
| `GET` | `/api/health/ready` | Readiness probe — DB + DLQ worker (no auth) | — |
| `POST` | `/api/scrape` | Trigger full Bronze → Silver → Gold pipeline | `10/minute` |
| `POST` | `/api/score/{place_id}` | Score a single lead manually | `20/minute` |
| `GET` | `/api/usage` | Daily API usage stats (admin dashboard) | — |
| `GET` | `/api/metrics?days=30` | Pipeline funnel, cost, provider split | — |
| `GET` | `/api/dlq/status` | DLQ health: counts by status + oldest pending | — |

**Frontend proxy routes** (Next.js `/api/*`): `scrape`, `usage`, `generate-pitch`, `metrics`, `dlq` — each validates the user session before forwarding to the backend.

---

## ⚙️ Environment Variables

### `backend/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (privileged, server-only) |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `SERPAPI_KEY` | — | SerpApi key (required for scraping) |
| `GROQ_API_KEY` | — | Groq API key (free LLM fallback) |
| `GROQ_MODEL` | — | Groq model name (default: `llama-3.3-70b-versatile`) |
| `BACKEND_API_KEY` | ✅ | Shared secret with frontend proxy (prod rejects defaults) |
| `APP_ENV` | — | `development` / `production` |
| `MAX_GEMINI_CALLS_PER_DAY` | — | FinOps cap (default: `50`) |
| `MAX_SCRAPER_RUNS_PER_DAY` | — | FinOps cap (default: `20`) |
| `SCRAPE_RATE_LIMIT` | — | SlowAPI syntax (default: `10/minute`) |
| `SCORE_RATE_LIMIT` | — | SlowAPI syntax (default: `20/minute`) |
| `SENTRY_DSN` | — | Sentry DSN (disabled if unset) |
| `SENTRY_TRACES_SAMPLE_RATE` | — | Sentry tracing rate (default: `0.1`) |
| `LOG_JSON` | — | Enable structured JSON logging (default: `false`) |
| `CORS_ORIGINS` | — | Allowed origins (default: `http://localhost:3000`) |
| `HOST` | — | Bind host (default: `0.0.0.0`) |
| `PORT` | — | Bind port (default: `8000`) |
| `SUPABASE_DB_URL` | — | Postgres URL for migrations + backups (not used at runtime) |

### `frontend/.env.local`

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL (browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (browser, RLS-protected) |
| `NEXT_PUBLIC_BACKEND_URL` | ✅ | Backend URL for browser requests |
| `NEXT_PUBLIC_GEMINI_DAILY_LIMIT` | — | Daily limit display in UI |
| `BACKEND_URL` | ✅ | Backend URL for server-side proxy |
| `BACKEND_API_KEY` | ✅ | Shared secret with backend |
| `GEMINI_API_KEY` | — | Gemini key for pitch generation route |
| `GOOGLE_GENERATIVE_AI_API_KEY` | — | Alternate Gemini key (AI SDK) |
| `GROQ_API_KEY` | — | Groq key for pitch fallback |
| `GEMINI_MODEL` | — | Model for pitch generation |
| `GROQ_MODEL` | — | Groq model for pitch fallback |

---

## 🧪 Testing

### Backend Tests

```bash
# Run all backend tests
python -m pytest backend/tests -q

# Run a specific test file
python -m pytest backend/tests/test_contracts.py -v

# Via Docker
make test
```

**Test coverage includes:**
- Data quality contracts (`test_contracts.py`)
- FinOps quota management (`test_finops.py`)
- Dead Letter Queue operations (`test_dlq.py`)
- API rate limiting (`test_rate_limit.py`)
- API hardening & body limits (`test_api_hardening.py`)
- Health & readiness probes (`test_health.py`)
- Scraper logic (`test_scraper.py`)
- Batch scoring (`test_score_batch.py`)
- Auto-tagging (`test_auto_tags.py`)
- Observability (`test_observability.py`)
- Migrations tool (`test_migrations_tool.py`)

### Frontend

```bash
cd frontend
npm run lint        # ESLint + type checking
npm run build       # Production build (catches type errors)
```

### CI Pipeline

GitHub Actions runs on every push/PR to `master`/`main`:
1. **Frontend job:** Node 20 → `npm ci` → lint → build
2. **Backend job:** Python 3.11 → install deps → Black formatting check → config smoke test → pytest

---

## 🚢 Deployment

### Backend (Container Host)

The backend ships as a Docker image. Deploy to any container platform (Render, Railway, Fly.io, Cloud Run, etc.):

```bash
docker build -f backend/Dockerfile -t citypulse-backend .
```

Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `BACKEND_API_KEY`, `APP_ENV=production`

**Health check:** configure your platform to probe `GET /api/health/ready` with `failureThreshold ≥ 3`.

### Frontend (Vercel)

1. Connect the repo to Vercel
2. Set the root directory to `frontend/`
3. Add the env vars from the frontend section above
4. Vercel auto-deploys on push with preview deploys for PRs

### Database Migrations

```bash
# Check migration status
SUPABASE_DB_URL=postgresql://... python scripts/run_migrations.py --status

# Apply pending migrations
SUPABASE_DB_URL=postgresql://... python scripts/run_migrations.py

# Adopt tracker on existing DB (first time only)
SUPABASE_DB_URL=postgresql://... python scripts/run_migrations.py --baseline
```

### Backups

- **Primary:** Supabase PITR (enable in dashboard → Database → Backups)
- **Secondary:** Automated daily `pg_dump` via GitHub Actions (`.github/workflows/backup.yml`), retained 14 days as build artifacts. Requires `SUPABASE_DB_URL` repo secret.

For full operational guidance, see the [Ops Runbook](project-docs/RUNBOOK.md).

---

## 🔄 Resilience & Cost Control

| Mechanism | How it Works |
|-----------|-------------|
| **Dead Letter Queue** | Failed scrape/clean/score tasks are enqueued in `dlq_tasks` and retried by a 60s background worker with exponential backoff (30s → 480s, max 5 retries). Retries never double-enqueue; quota exhaustion is terminal. |
| **Provider Fallbacks** | Gemini → Groq (free) on any LLM error/quota hit; SerpApi → Selenium (best-effort) on scraper failure. |
| **FinOps Quotas** | Atomic Postgres RPCs cap Gemini calls and scraper runs per day. The Analytics page shows a live budget meter. |
| **Data Quality Gates** | Rows failing Silver/Gold Pydantic contracts are quarantined, never promoted downstream. |
| **Pipeline Concurrency** | Bounded to 3 simultaneous pipelines with per-stage timeouts (scrape: 180s, clean: 180s, score: 900s). |
| **Graceful Shutdown** | In-flight pipeline runs are marked `failed` on restart so the UI doesn't show stuck jobs. |
| **Rate Limiting** | Per-route burst caps protect shared API budgets without a distributed store. |

---

## 📊 Project Status

### ✅ Phase 1 — Critical Fixes
- [x] Green CI baseline (pytest-mock, conftest, Black, pytest.ini)
- [x] Auth-gate all `/api/*` routes + fail-closed prod secret guard + tighter CORS
- [x] Kill admin privilege escalation (`is_admin()` → `app_metadata`, default-role trigger)
- [x] Fix Kanban drag for sales reps (claim-on-move satisfies RLS)
- [x] DLQ: no duplicate re-enqueue on retry + async-safe DB calls
- [x] Prevent duplicate leads (`UNIQUE(place_id)` + idempotent upsert)
- [x] Honest Selenium fallback + removed dead code
- [x] Gemini → Groq free-tier fallback (scoring + pitch)

### ✅ Phase 2 — Data Engineering Depth
- [x] Data quality — typed contracts + Silver/Gold gates + tests
- [x] Observability + cost — `pipeline_runs`/`pipeline_metrics` tables, per-run rows + LLM token/cost, `/api/metrics` + `/api/dlq/status`, opt-in structured logging
- [x] Reproducibility + docs — Docker Compose, seed data, README, Makefile, tracked migration runner

### ✅ Phase 3 — Production Hardening & Product
- [x] Reliability — parallel scoring, per-stage timeouts, bounded concurrency, graceful shutdown, tenacity retries
- [x] API hardening — rate limiting, input/body-size limits, liveness + readiness probes
- [x] Error tracking & ops — Sentry (DSN-gated), ops runbook, scheduled `pg_dump` backup workflow
- [x] Resilience UX — error boundaries, realtime auto-reconnect + polling fallback
- [x] Auth UX — password reset, resend confirmation, account page
- [x] A11y & motion — modal focus traps + Escape, `prefers-reduced-motion`
- [x] Onboarding — first-run empty state + guidance
- [x] Product — lead notes & activity timeline, tags + bulk actions, CSV export, saved filters

### 🗺️ Future Roadmap
- [ ] Orchestration — replace FastAPI BackgroundTasks with Prefect (scheduling, backfill, retries, run UI)
- [ ] Scheduled/recurring scrapes with cron + backfill
- [ ] SCD-style history for re-scored leads (heat-score over time)
- [ ] Frontend tests (Vitest/RTL) + pipeline integration tests
- [ ] Audit log table (who did what)
- [ ] Webhooks / public API for integrations
- [ ] Email notifications (new hot leads, daily digest)

**Next Iteration Candidates**
- [ ] **Job Orchestration:** Replace FastAPI BackgroundTasks with a durable orchestrator (Prefect, Celery).
- [ ] **Data Transformations:** Migrate Bronze -> Silver -> Gold logic into dbt or DLT.
- [ ] **Security:** Shift sensitive Supabase data fetching from frontend anon key to backend API routes.

---

## 🏛️ Design Decisions & Trade-offs

| Decision | Rationale |
|----------|-----------|
| **Medallion architecture** | Keeps raw data immutable (replayable) and separates concerns (ingest vs clean vs enrich vs serve). |
| **LLM as a transformation step** | Powerful but non-deterministic and costs money → mitigated with low temperature, JSON-mode, FinOps quotas, a free fallback, and DQ gates on output. |
| **FastAPI BackgroundTasks** | Chosen for simplicity; they're ephemeral (lost on restart) — future work moves orchestration to Prefect for durability/scheduling. |
| **Pydantic contracts** (not pandera/GE) | Pipeline is dict-based, not DataFrame-based; same DQ intent, lighter fit. |
| **Supabase** | Gives Postgres + Auth + Realtime + RLS in one — the serving layer (Kanban) updates live with no custom websocket code. |
| **In-memory rate limiting** | The backend is called server-to-server by the Next.js proxy (single upstream IP). Global burst cap is intentional for a single-tenant showcase without requiring Redis. |

---

## ⚠️ Known Limitations

- Orchestration is in-process (no scheduler/backfill) — planned for future
- Selenium fallback is best-effort and won't run on serverless hosts; SerpApi is the supported scraper
- No frontend tests yet; backend has 12 test files covering contracts, finops, DLQ, rate limits, health probes, and more
- Rate limiting is in-memory/per-process (no distributed store) — sufficient for single-tenant/showcase
- Schema changes ship as incremental migrations applied via `scripts/run_migrations.py`; the canonical `project-docs/schema.sql` is the from-scratch reference

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Make your changes
4. Run the test suite:
   ```bash
   python -m pytest backend/tests -q
   cd frontend && npm run lint && npm run build
   ```
5. Commit with conventional commits (`feat:`, `fix:`, `docs:`, etc.)
6. Push and open a Pull Request

The CI pipeline will automatically run lint, type check, build, and tests on your PR.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ by [Akshay](https://github.com/akshayev)**

⚡ CityPulse CRM — *Where data engineering meets AI-powered sales*

</div>
]]>

<!-- end of readme -->
