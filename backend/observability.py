"""
CityPulse CRM — Observability setup (B3).

Sentry error tracking and structured logging. Both are inert unless explicitly
configured, so local/dev/CI runs never phone home and keep human-readable logs.
"""

import json
import logging

from backend.config import settings

logger = logging.getLogger(__name__)


def init_sentry() -> bool:
    """Initialise Sentry if a DSN is set. Returns True when enabled.

    Safe to call unconditionally: with no DSN it is a no-op, and the sentry_sdk
    capture/tag helpers used elsewhere are themselves no-ops until init runs.
    """
    if not settings.sentry_dsn:
        return False

    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        integrations=[StarletteIntegration(), FastApiIntegration()],
    )
    logger.info("Sentry error tracking enabled (env=%s)", settings.app_env)
    return True


class _JsonFormatter(logging.Formatter):
    """Minimal JSON log formatter (avoids an extra dependency)."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        # Thread any extra structured fields (e.g. run_id) attached via `extra=`.
        if hasattr(record, "run_id"):
            payload["run_id"] = record.run_id
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging() -> None:
    """Switch the root handler to JSON when settings.log_json is on."""
    if not settings.log_json:
        return
    root = logging.getLogger()
    # If nothing configured a handler yet (e.g. a worker entrypoint that skips
    # logging.basicConfig), add one so JSON logging isn't silently a no-op.
    if not root.handlers:
        root.addHandler(logging.StreamHandler())
    formatter = _JsonFormatter()
    for handler in root.handlers:
        handler.setFormatter(formatter)
    logger.info("Structured JSON logging enabled")
