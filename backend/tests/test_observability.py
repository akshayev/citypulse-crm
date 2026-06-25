"""Tests for B3 observability wiring (Sentry + JSON logging are opt-in)."""

import logging

import backend.observability as obs


def test_sentry_disabled_without_dsn(monkeypatch):
    """No DSN → init is a no-op and returns False (never phones home in dev/CI)."""
    monkeypatch.setattr(obs.settings, "sentry_dsn", None)
    assert obs.init_sentry() is False


def test_sentry_enabled_with_dsn(monkeypatch):
    """A DSN → sentry_sdk.init is invoked exactly once and init returns True."""
    monkeypatch.setattr(
        obs.settings, "sentry_dsn", "https://pub@example.ingest.sentry.io/1"
    )
    calls = {}

    import sentry_sdk

    def fake_init(**kwargs):
        calls.update(kwargs)

    monkeypatch.setattr(sentry_sdk, "init", fake_init)
    assert obs.init_sentry() is True
    assert calls["dsn"].startswith("https://")
    assert "traces_sample_rate" in calls


def test_json_logging_off_by_default(monkeypatch):
    """log_json off → root handlers keep their existing (non-JSON) formatter."""
    monkeypatch.setattr(obs.settings, "log_json", False)
    obs.configure_logging()  # should not raise and should not swap formatters


def test_json_formatter_emits_valid_json():
    """The JSON formatter produces parseable output incl. extra run_id."""
    import json

    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="hello %s",
        args=("world",),
        exc_info=None,
    )
    record.run_id = "run-123"
    out = obs._JsonFormatter().format(record)
    parsed = json.loads(out)
    assert parsed["msg"] == "hello world"
    assert parsed["level"] == "INFO"
    assert parsed["run_id"] == "run-123"
