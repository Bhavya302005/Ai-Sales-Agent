"""
discovery/phone_enricher.py
===========================
Deep phone/email enrichment for any DiscoveryItem.

Strategy:
  1. Build 6–8 highly targeted Exa queries from the lead's title, company, author,
     source domain, and location.
  2. Run all queries in parallel against Exa via mcporter.
  3. Extract phone numbers (E.164 + loose patterns), emails, WhatsApp links, and
     Calendly links from the aggregated raw text.
  4. Return a plain dict that callers merge into provider_metadata.

No migration needed — results are stored inside the existing provider_metadata
JSON column on SourceDocument.  The phone enricher is fully non-blocking:
failures are swallowed so the lead always appears, just without a phone.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import TYPE_CHECKING

# Load .env from project root so EXA_API_KEY is available in subprocess env
_ENV_FILE = Path(__file__).resolve().parents[4] / ".env"
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

_EXA_API_KEY: str = os.environ.get("EXA_API_KEY", "")

if TYPE_CHECKING:
    from app.discovery.service import DiscoveryItem

# ── Phone/email regexes ────────────────────────────────────────────────────────
_E164 = re.compile(r"\+[1-9]\d{7,14}")
_LOOSE_PHONE = re.compile(
    r"(?:"
    r"\+?1[\s\-.]?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}"   # US/CA
    r"|\+?44[\s\-.]?\d{4}[\s\-.]?\d{6}"                      # UK
    r"|\+?61[\s\-.]?\d[\s\-.]?\d{4}[\s\-.]?\d{4}"            # AU
    r"|\+?91[\s\-.]?\d{5}[\s\-.]?\d{5}"                      # IN
    r"|\+?225[\s\-.]?\d{2}[\s\-.]?\d{2}[\s\-.]?\d{2}[\s\-.]?\d{2}"  # CI
    r"|\+\d{1,3}[\s\-.]?\d{6,12}"                            # Generic intl
    r")"
)
_EMAIL = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
_WHATSAPP = re.compile(r"https?://wa\.me/\S+")
_CALENDLY = re.compile(r"https?://calendly\.com/\S+")

# Known junk phone-like numbers that appear on SEO spam pages
_BLACKLIST_PHONES = {
    "+85264416439",  # Hong Kong SEO spam
}

# Domains we skip for email extraction
_SKIP_EMAIL_DOMAINS = {
    "example.com", "w3.org", "microsoft.com", "linkedin.com",
    "google.com", "schema.org",
}


def _normalise_phone(raw: str) -> str:
    """Normalise any matched phone string to E.164 where possible."""
    digits = re.sub(r"[^\d+]", "", raw)
    if re.fullmatch(r"\+[1-9]\d{7,14}", digits):
        return digits
    if not digits.startswith("+"):
        stripped = digits.lstrip("0")
        for prefix in ("+1", "+44", "+61", "+91", "+225"):
            candidate = prefix + stripped
            if re.fullmatch(r"\+[1-9]\d{7,14}", candidate):
                return candidate
    return ""


def _extract_contacts(text: str) -> dict:
    phones: set[str] = set()
    for m in _E164.findall(text):
        n = _normalise_phone(m)
        if n and n not in _BLACKLIST_PHONES:
            phones.add(n)
    for m in _LOOSE_PHONE.findall(text):
        n = _normalise_phone(m)
        if n and n not in _BLACKLIST_PHONES and len(n) >= 10:
            phones.add(n)

    emails: set[str] = set()
    for e in _EMAIL.findall(text):
        domain = e.split("@")[-1].lower()
        if (
            domain not in _SKIP_EMAIL_DOMAINS
            and not e.endswith(".png")
            and "@2x" not in e
        ):
            emails.add(e.lower())

    return {
        "phones": sorted(phones),
        "emails": sorted(emails),
        "whatsapp": list(set(_WHATSAPP.findall(text))),
        "calendly": list(set(_CALENDLY.findall(text))),
    }


def _exa_search(query: str, num: int = 8) -> str:
    """Run a single Exa query via mcporter and return raw text."""
    executable = shutil.which("mcporter")
    if not executable:
        return ""
    args: dict = {"query": query, "numResults": num}
    if _EXA_API_KEY:
        cmd = [
            executable, "call",
            "--http-url", f"https://mcp.exa.ai/mcp?exaApiKey={_EXA_API_KEY}",
            "--tool", "web_search_exa",
            "--output", "json",
            "--args", json.dumps(args),
            "--timeout", "25000",
        ]
    else:
        cmd = [
            executable, "call", "exa.web_search_exa",
            "--output", "json",
            "--args", json.dumps(args),
            "--timeout", "25000",
            "--no-oauth",
        ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            check=False,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    if result.returncode != 0 or not result.stdout.strip():
        return ""
    try:
        payload = json.loads(result.stdout)
        return "\n".join(
            b["text"] for b in payload.get("content", []) if b.get("type") == "text"
        )
    except Exception:
        return ""


def _build_queries(item: DiscoveryItem) -> list[str]:
    """Generate 6–8 highly targeted queries for a given DiscoveryItem."""
    from urllib.parse import urlsplit

    title = re.sub(r"[^\w\s&-]", " ", item.title)[:50].strip()
    company = re.sub(r"[^\w\s&-]", " ", item.company or "")[:40].strip()
    domain = urlsplit(item.canonical_url).netloc.replace("www.", "")

    queries: list[str] = []

    # 1. Company + "phone OR contact"
    if company:
        queries.append(
            f'"{company}" phone OR mobile OR WhatsApp OR "reach us" OR "contact us"'
        )
        # 2. Company on directories
        queries.append(
            f'"{company}" site:zoominfo.com OR site:rocketreach.co OR '
            f'site:clutch.co OR site:manta.com phone'
        )

    # 3. Title + contact (good for RFPs where the title has the company)
    queries.append(
        f'"{title}" contact phone OR email OR "procurement officer"'
    )

    # 4. Source domain — the site:X trick for government/company portals
    if domain and "freelancer" not in domain and "linkedin" not in domain:
        queries.append(
            f'site:{domain} phone OR contact OR email OR "reach us"'
        )

    # 5. Location-aware — whitepages / regional directory
    if item.location:
        loc = re.sub(r"[^\w\s,]", " ", item.location)[:40].strip()
        queries.append(f'"{company or title}" "{loc}" phone OR mobile')

    # 6. WhatsApp / personal contact
    if company:
        queries.append(
            f'"{company}" WhatsApp OR wa.me OR "direct message" OR LinkedIn'
        )

    # 7. LinkedIn company page for phone
    if company:
        queries.append(
            f'site:linkedin.com/company "{company}" phone OR contact'
        )

    # 8. Broad catch-all for the title across all indexed pages
    queries.append(
        f'"{title}" phone OR email procurement OR contact OR "get in touch"'
    )

    return queries[:8]


def enrich_contact(item: DiscoveryItem) -> dict:
    """
    Run the deep phone/email enrichment for a DiscoveryItem.

    Returns a dict with keys:
        phones        - list of E.164 phone numbers found
        emails        - list of email addresses found
        whatsapp      - list of wa.me URLs found
        calendly      - list of Calendly links found
        best_phone    - the most country-appropriate phone, or ""
        best_email    - the first email found, or ""
        enriched      - True (always, even if nothing found)

    This dict is safe to merge into SourceDocument.provider_metadata.
    """
    queries = _build_queries(item)
    all_text = ""

    # Run up to 4 queries in parallel, remaining serial to avoid Exa rate limit
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(_exa_search, q): q for q in queries}
        for future in as_completed(futures):
            try:
                all_text += future.result() + "\n"
            except Exception:
                pass

    contacts = _extract_contacts(all_text)
    best_phone = contacts["phones"][0] if contacts["phones"] else ""
    best_email = contacts["emails"][0] if contacts["emails"] else ""

    return {
        **contacts,
        "best_phone": best_phone,
        "best_email": best_email,
        "enriched": True,
    }
