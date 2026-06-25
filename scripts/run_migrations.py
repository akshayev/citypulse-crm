#!/usr/bin/env python3
"""
CityPulse CRM — SQL migration runner (E2).

Applies pending migrations from supabase/migrations/ in filename order, each in
its own transaction, recording applied versions in a schema_migrations table so
runs are idempotent. A thin, dependency-light alternative to the Supabase CLI
that works over the IPv4 session pooler.

Usage (connection from SUPABASE_DB_URL):
    SUPABASE_DB_URL=postgresql://user:pass@host:5432/postgres \
        python scripts/run_migrations.py            # apply pending
        python scripts/run_migrations.py --status   # list applied / pending
        python scripts/run_migrations.py --baseline # mark all as applied without
                                                    # running (adopt on an existing DB)
"""

import os
import pathlib
import sys

MIGRATIONS_DIR = (
    pathlib.Path(__file__).resolve().parent.parent / "supabase" / "migrations"
)


def migration_files() -> list[pathlib.Path]:
    """All migration files, sorted by filename (timestamp-prefixed)."""
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def _connect():
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        sys.exit("SUPABASE_DB_URL is not set (postgresql://… session-pooler URL).")
    import psycopg2

    return psycopg2.connect(url, sslmode="require")


def _ensure_table(cur) -> None:
    cur.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version    text PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
        )
        """)


def _applied(cur) -> set[str]:
    cur.execute("SELECT version FROM schema_migrations")
    return {row[0] for row in cur.fetchall()}


def main(argv: list[str]) -> int:
    files = migration_files()
    conn = _connect()
    try:
        conn.autocommit = False
        cur = conn.cursor()
        _ensure_table(cur)
        conn.commit()
        applied = _applied(cur)
        pending = [f for f in files if f.name not in applied]

        if "--status" in argv:
            print(f"Applied: {len(applied)}  Pending: {len(pending)}")
            for f in files:
                print(("  [x] " if f.name in applied else "  [ ] ") + f.name)
            return 0

        if "--baseline" in argv:
            for f in files:
                cur.execute(
                    "INSERT INTO schema_migrations(version) VALUES (%s) "
                    "ON CONFLICT DO NOTHING",
                    (f.name,),
                )
            conn.commit()
            print(f"Baselined {len(files)} migration(s) as applied (no SQL run).")
            return 0

        if not pending:
            print("No pending migrations.")
            return 0

        for f in pending:
            print(f"Applying {f.name} …")
            try:
                cur.execute(f.read_text())
                cur.execute(
                    "INSERT INTO schema_migrations(version) VALUES (%s)", (f.name,)
                )
                conn.commit()
            except Exception as e:  # noqa: BLE001
                conn.rollback()
                sys.exit(f"FAILED on {f.name}: {e}")
        print(f"Applied {len(pending)} migration(s).")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
