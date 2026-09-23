"""
discovery/exa_client.py
========================
Thin synchronous wrapper around the Exa REST API.

Behaviour:
  • If EXA_API_KEY is set in the environment → use the real Exa /search endpoint
    (existing callers are unaffected).
  • If EXA_API_KEY is absent or empty       → fall back to the free
    DuckDuckGo-based web_searcher.exa_search shim transparently.

This keeps every caller in the codebase working without any changes while
making the whole pipeline zero-cost and zero-API-key when the key is not set.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx

# ── Load .env ─────────────────────────────────────────────────────────────────
_ENV_FILE = Path(__file__).resolve().parents[4] / ".env"
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

EXA_API_KEY: str = os.environ.get("EXA_API_KEY", "")
_EXA_BASE = "https://api.exa.ai"
_TIMEOUT = 30.0


def _exa_api_search(
    query: str,
    *,
    num_results: int = 8,
    include_domains: list[str] | None = None,
    start_published_date: str | None = None,
    use_autoprompt: bool = False,
) -> str:
    """Direct Exa REST API call (used only when EXA_API_KEY is present)."""
    payload: dict[str, Any] = {
        "query": query,
        "numResults": num_results,
        "contents": {
            "text": {"maxCharacters": 2000},
            "highlights": {"numSentences": 3},
        },
        "useAutoprompt": use_autoprompt,
    }
    if include_domains:
        payload["includeDomains"] = include_domains
    if start_published_date:
        payload["startPublishedDate"] = start_published_date

    try:
        resp = httpx.post(
            f"{_EXA_BASE}/search",
            headers={
                "x-api-key": EXA_API_KEY,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=payload,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except (httpx.HTTPError, httpx.TimeoutException, ValueError):
        return ""

    parts: list[str] = []
    for result in data.get("results", []):
        title = result.get("title", "")
        url = result.get("url", "")
        text = result.get("text", "")
        highlights = " ".join(result.get("highlights", []))
        parts.append(f"Title: {title}\nURL: {url}\n{text}\n{highlights}")

    return "\n---\n".join(parts)


def exa_search(
    query: str,
    *,
    num_results: int = 8,
    include_domains: list[str] | None = None,
    start_published_date: str | None = None,
    use_autoprompt: bool = False,
) -> str:
    """
    Call Exa if a key is available; otherwise delegate to the free
    DuckDuckGo-based web_searcher shim.

    Callers always receive the same concatenated-text string regardless of
    which backend was used.
    """
    if EXA_API_KEY:
        return _exa_api_search(
            query,
            num_results=num_results,
            include_domains=include_domains,
            start_published_date=start_published_date,
            use_autoprompt=use_autoprompt,
        )

    # Free fallback — no API key needed
    from app.discovery.web_searcher import exa_search as _ddg_search  # noqa: PLC0415

    return _ddg_search(
        query,
        num_results=num_results,
        include_domains=include_domains,
        start_published_date=start_published_date,
        use_autoprompt=use_autoprompt,
    )
