"""
discovery/exa_client.py
========================
Thin synchronous wrapper around the Exa REST API.

Replaces the previous mcporter subprocess approach with a direct httpx call,
making the discovery pipeline compatible with any environment (Vercel, Render,
local, CI) without needing the mcporter CLI installed.

Usage:
    from app.discovery.exa_client import exa_search
    text = exa_search("my query", num_results=8)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx

# ── Load .env so the key is available when running outside uvicorn ────────────
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


def exa_search(
    query: str,
    *,
    num_results: int = 8,
    include_domains: list[str] | None = None,
    start_published_date: str | None = None,
    use_autoprompt: bool = False,
) -> str:
    """
    Call the Exa /search endpoint and return the concatenated text of all results.

    Returns an empty string on any failure — callers treat enrichment as
    best-effort so the lead always appears even without contact data.
    """
    if not EXA_API_KEY:
        return ""

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

    # Concatenate title + URL + text from each result into one string
    # so downstream regex extractors work the same as before.
    parts: list[str] = []
    for result in data.get("results", []):
        title = result.get("title", "")
        url = result.get("url", "")
        text = result.get("text", "")
        highlights = " ".join(result.get("highlights", []))
        parts.append(f"Title: {title}\nURL: {url}\n{text}\n{highlights}")

    return "\n---\n".join(parts)
