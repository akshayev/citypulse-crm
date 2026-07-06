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
