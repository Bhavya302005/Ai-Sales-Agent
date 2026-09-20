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

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING

from app.discovery.exa_client import exa_search as _exa_raw

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
    """Run a single Exa query via the direct REST API and return raw text."""
    return _exa_raw(query, num_results=num)


def _build_queries(item: DiscoveryItem) -> list[str]:
    """Generate up to 8 decision-maker-targeted queries for a DiscoveryItem.

    Priority order:
      1. Person-specific queries (if company field contains a person name)
      2. Company-level directory lookups
      3. Domain / RFP fallback
    """
    from urllib.parse import urlsplit

    raw_name = re.sub(r"[^\w\s&\-.] ", " ", item.company or "").strip()
    title = re.sub(r"[^\w\s&\-]", " ", item.title)[:50].strip()
    domain = urlsplit(item.canonical_url).netloc.replace("www.", "")

    name_words = raw_name.split()
    _co_words = ["ltd", "llc", "inc", "pty", "corp", "solutions", "agency",
                 "group", "partners", "consulting", "technologies", "systems", "people"]
    is_person = (
        2 <= len(name_words) <= 4
        and all(w[0].isupper() for w in name_words if w)
        and not any(kw in raw_name.lower() for kw in _co_words)
    )

    queries: list[str] = []

    if is_person:
        name = raw_name
        first = name_words[0].lower()
        last = name_words[-1].lower() if len(name_words) > 1 else ""
        queries.append(f'"{name}" phone OR mobile OR WhatsApp OR "direct line"')
        queries.append(f'"{name}" site:zoominfo.com OR site:rocketreach.co phone email')
        queries.append(f'"{first}.{last}" OR "{name}" email contact phone')
        queries.append(f'site:linkedin.com/in "{name}" phone OR email OR contact')
        queries.append(f'"{name}" site:whitepages.com OR site:truepeoplesearch.com phone')
        queries.append(f'"{name}" employer company contact phone email')
    else:
        company = raw_name
        if company:
            queries.append(f'"{company}" CEO OR Director OR "Head of" phone OR mobile OR email')
            queries.append(f'"{company}" site:zoominfo.com OR site:rocketreach.co OR site:clutch.co phone')
            queries.append(f'"{company}" contact phone email "reach us"')
            queries.append(f'site:linkedin.com/company "{company}" phone OR contact OR email')
        if domain and "freelancer" not in domain and "linkedin" not in domain:
            queries.append(f'site:{domain} contact OR phone OR "get in touch"')
        if item.location:
            loc = re.sub(r"[^\w\s,]", " ", item.location)[:40].strip()
            queries.append(f'"{company or title}" "{loc}" phone OR mobile')
        queries.append(f'"{title}" contact phone email procurement')

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
