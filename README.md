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

