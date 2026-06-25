# CityPulse CRM — Ops Runbook

Operational reference for running CityPulse in production (managed container backend + Vercel frontend + Supabase). Keep this current as infrastructure changes.

---

## 1. Health & probes

| Probe | Endpoint | Meaning |
|-------|----------|---------|
| Liveness | `GET /api/health` | Process is up. Restart the container if this fails. |
| Readiness | `GET /api/health/ready` | `200` only when the DB is reachable **and** the DLQ worker has beaten within `DLQ_HEARTBEAT_MAX_AGE_SECONDS` (default 180s). Returns `503` otherwise — route traffic away. |

Wire your platform's health check to **`/api/health/ready`** (with a `failureThreshold ≥ 3` to tolerate a single transient flap), and the restart probe to `/api/health`.

Observability dashboards: `GET /api/metrics` (funnel %, cost/1k leads, Gemini-vs-Groq split) and `GET /api/dlq/status` (pending/retrying/failed + oldest age). Both require `X-API-Key`.

---

## 2. Error tracking (Sentry)

Sentry is **disabled unless `SENTRY_DSN` is set** — local/dev/CI never phone home.

### Backend (wired)
Set on the container host:
```
SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>
APP_ENV=production
SENTRY_TRACES_SAMPLE_RATE=0.1   # optional; keep low for free-tier budgets
```
Initialised in `backend/observability.py` (`init_sentry`), called from the app lifespan. Pipeline crashes are captured with `component=pipeline` and `run_id` tags (`backend/main.py`).

### Frontend (setup steps — not auto-wired)
`@sentry/nextjs` is a build-time integration; on this Next.js 16 + Turbopack stack, add it deliberately:
1. `npm i @sentry/nextjs` in `frontend/`.
2. `npx @sentry/wizard@latest -i nextjs` (generates `sentry.*.config.ts` + instrumentation).
3. Verify `npm run build` still passes under Turbopack before deploying.
4. Set `NEXT_PUBLIC_SENTRY_DSN` in Vercel.
The global `app/error.tsx` boundary already prevents white-screens; Sentry adds reporting on top.

---

## 3. Backups & disaster recovery

### a) Supabase PITR (primary — enable in the dashboard)
Point-in-time recovery is the first line of defence. **Manual step (requires account access):**
- Supabase Dashboard → Project → **Database → Backups → Point in Time Recovery** → enable (paid tier).
- Confirm the retention window meets your RPO (e.g. 7 days).

### b) Logical `pg_dump` snapshots (secondary — automated)
`.github/workflows/backup.yml` runs a daily `pg_dump` and uploads it as a build artifact. **Requires a repo secret:**
- `SUPABASE_DB_URL` — the session-pooler connection string (`postgresql://postgres.<ref>:<pw>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`).
The workflow is a no-op (skips) if the secret is absent, so forks don't fail.

### Restore drill (do this at least once)
```
# From a pg_dump artifact:
pg_restore --clean --if-exists -d "$SUPABASE_DB_URL" backup.dump
# Or, for PITR: use the dashboard "Restore" to a fresh project, then re-point env.
```

---

## 4. Secrets & key rotation (SOP)

Secrets live only in `backend/.env` (gitignored) and the host's env / Vercel project settings — **never** committed. Inventory:

| Secret | Where | Rotate by |
|--------|-------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | backend env | Supabase → Settings → API → roll the service_role key; redeploy backend. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel env | Roll anon key; redeploy frontend. (Public by design — RLS is the boundary.) |
| `BACKEND_API_KEY` | backend env + Vercel (`BACKEND_API_KEY`) | Generate a strong value; update both sides together to avoid 401s. Prod refuses to boot with a placeholder. |
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `SERPAPI_KEY` | backend env | Roll in the provider console; redeploy. |

Rotation cadence: quarterly, and immediately on any suspected leak. After rotating `BACKEND_API_KEY`, update frontend and backend in the **same** change window.

---

## 5. Common incidents

| Symptom | First checks | Likely fix |
|---------|--------------|-----------|
| Readiness 503 | `/api/dlq/status` age; DB reachability | DB outage → wait/restore; stalled worker → restart container. |
| Scrapes never finish | Active Jobs panel stage; backend logs; `run` row `status` | Stage timeout/quota → check `/api/metrics`, SerpApi/Gemini quota; failed runs auto-marked. |
| 429s on scrape/score | Expected under burst (global cap, see `config.py`) | Raise `SCRAPE_RATE_LIMIT` / `SCORE_RATE_LIMIT` if legitimately needed. |
| Pitch generation fails | Sentry; Vercel function logs | Gemini quota → Groq fallback should engage; check `NEXT_PUBLIC_GEMINI_DAILY_LIMIT`. |
| Board empty after deploy | RLS / auth | Confirm login + `run make seed` for demo data. |
