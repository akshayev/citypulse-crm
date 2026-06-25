"""Tests for the migration runner's discovery logic (no DB required)."""

from scripts import run_migrations


def test_migration_files_are_sorted_sql():
    files = run_migrations.migration_files()
    names = [f.name for f in files]
    # All are .sql and discovered in deterministic (sorted) order.
    assert names == sorted(names)
    assert all(n.endswith(".sql") for n in names)


def test_known_migrations_present():
    names = {f.name for f in run_migrations.migration_files()}
    # A couple of anchors so a renamed/missing migration is caught.
    assert "20260625120000_lead_activity.sql" in names
    assert "20260625140000_saved_filters.sql" in names
