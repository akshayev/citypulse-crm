"""
Shared retry policy for transient external-call failures (LLMs, SerpApi).

Retries only transient errors (network issues, 5xx, timeouts) with exponential
backoff + jitter; auth/quota/validation errors (4xx) are NOT retried so we fail
fast and fall back instead of hammering a broken provider.
"""

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential_jitter,
    retry_if_exception,
)


def is_transient(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    if isinstance(exc, httpx.RequestError):
        return True
    name = type(exc).__name__.lower()
    return any(
        k in name
        for k in (
            "server",
            "timeout",
            "deadline",
            "unavailable",
            "connection",
            "temporar",
        )
    )


# Decorator: up to 3 attempts, 1s→8s jittered backoff, re-raise the last error.
transient_retry = retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential_jitter(initial=1, max=8),
    retry=retry_if_exception(is_transient),
)
