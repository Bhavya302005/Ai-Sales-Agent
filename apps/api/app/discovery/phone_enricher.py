"""
discovery/phone_enricher.py
============================
Deep phone / email enrichment for any DiscoveryItem.

Improvement over the Exa-based version
---------------------------------------
Layer 1 — item.content fast path        (instant, always runs)
Layer 2 — Direct company website crawl  (tel: hrefs, JSON-LD, microdata)
Layer 3 — DuckDuckGo queries            (free, no API key, parallel)

Layer 2 is the key addition: when we crawl the actual company website we can
extract ``tel:`` href links and JSON-LD structured data that Exa/DDG snippet
searches completely miss.  This alone raises precision dramatically.

The phone / email extraction regexes are unchanged — they already have
country-aware validation and blacklist filtering.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

from app.discovery.web_searcher import (
    crawl_for_contacts,
    ddg_search,
    extract_tel_hrefs,
    extract_jsonld_phones,
    extract_microdata_phones,
    extract_wa_links,
)
from bs4 import BeautifulSoup

if TYPE_CHECKING:
    from app.discovery.service import DiscoveryItem

# ── High-Precision Phone Regexes ──────────────────────────────────────────────
# India mobile: 10 digits starting with 6-9, optionally +91 / 0 prefix
_INDIA_PHONE = re.compile(r"(?:\+91[\s\-]?)?(?:0)?([6-9]\d{4}[\s\-]?\d{5})\b")

# US/CA: Area 200-999, exchange 200-999 (eliminates tracking IDs starting 0 or 1)
_US_PHONE = re.compile(
    r"(?:\+1[\s\-.]?)?\(?([2-9]\d{2})\)?[\s\-.]?([2-9]\d{2})[\s\-.]?(\d{4})\b"
)

# UK: Mobile (07xxx) or major landline (01/02xxx)
_UK_PHONE = re.compile(r"(?:\+44[\s\-.]?|0)(7\d{3}[\s\-.]?\d{6}|[12]\d{3}[\s\-.]?\d{6})\b")

# AU: Mobile (04xx) or landline
_AU_PHONE = re.compile(
    r"(?:\+61[\s\-.]?|0)(4\d{2}[\s\-.]?\d{3}[\s\-.]?\d{3}|[2378]\d{1}[\s\-.]?\d{4}[\s\-.]?\d{4})\b"
)

# Explicit E.164 already in text (no spaces)
_E164 = re.compile(r"\+[1-9]\d{8,14}\b")

# Broad international: +CC <digits with optional separators>
# Catches +225 2720263900, +44 1234 567890, etc.
_BROAD_INTL = re.compile(
    r"\+(\d{1,4})[\s\-.]?(\d{2,5})[\s\-.]?(\d{2,5})[\s\-.]?(\d{0,5})\b"
)

# WhatsApp links
_WHATSAPP_LINK = re.compile(r"(?:wa\.me/|whatsapp\.com/send\?phone=)(\d{10,14})")

# Email
_EMAIL = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")

# Known spam / placeholder numbers
_BLACKLIST_PHONES = {
    "+85264416439",
    "+12025550143",
    "+14155552671",
    "+18001234567",
}

_SKIP_EMAIL_DOMAINS = {
    "example.com", "w3.org", "microsoft.com", "linkedin.com",
    "google.com", "schema.org", "sentry.io",
}

# Domains we don't bother crawling (they block bots or have no contact info)
_NO_CRAWL_DOMAINS = {
    "linkedin.com", "freelancer.com", "upwork.com", "indeed.com",
    "glassdoor.com", "twitter.com", "x.com", "facebook.com",
    "instagram.com", "youtube.com",
}


# ── Contact extractors ────────────────────────────────────────────────────────

def _extract_contacts(text: str) -> dict[str, Any]:
    """Extract and validate phone numbers and emails from arbitrary text."""
    phones: set[str] = set()

    # Structured tags from crawl_for_contacts() — highest confidence
    for m in re.finditer(r"(?:TEL_HREF|JSONLD|MICRODATA):(\S+)", text):
        raw = m.group(1).strip()
        digits = re.sub(r"[^\d+]", "", raw)
        if len(digits) >= 8:
            normed = digits if digits.startswith("+") else f"+{digits}"
            if normed not in _BLACKLIST_PHONES:
                phones.add(normed)

    # WhatsApp links
    for digits in _WHATSAPP_LINK.findall(text):
        if len(digits) == 10 and digits[0] in "6789":
            phones.add(f"+91{digits}")
        elif len(digits) >= 10:
            phones.add(f"+{digits}")

    # Indian mobile numbers
    for m in _INDIA_PHONE.finditer(text):
        raw = re.sub(r"[^\d]", "", m.group(1))
        if len(raw) == 10 and raw[0] in "6789":
            candidate = f"+91{raw}"
            if candidate not in _BLACKLIST_PHONES:
                phones.add(candidate)

    # US / CA
    for m in _US_PHONE.finditer(text):
        area, exch, sub = m.group(1), m.group(2), m.group(3)
        candidate = f"+1{area}{exch}{sub}"
        if candidate not in _BLACKLIST_PHONES:
            phones.add(candidate)

    # UK
    for m in _UK_PHONE.finditer(text):
        digits = re.sub(r"[^\d]", "", m.group(1))
        candidate = f"+44{digits}"
        if candidate not in _BLACKLIST_PHONES:
            phones.add(candidate)

    # AU
    for m in _AU_PHONE.finditer(text):
        digits = re.sub(r"[^\d]", "", m.group(1))
        candidate = f"+61{digits}"
        if candidate not in _BLACKLIST_PHONES:
            phones.add(candidate)

    # Strict E.164 already in text
    for m in _E164.findall(text):
        if m not in _BLACKLIST_PHONES and len(m) <= 15:
            if not re.search(r"^\+1[01]", m):  # exclude invalid US area codes
                phones.add(m)

    # Broad international (handles spaced formats: +225 2720263900, +44 1234 567890)
    for m in _BROAD_INTL.finditer(text):
        groups = [g for g in m.groups() if g]  # drop empty groups
        digits_only = re.sub(r"[^\d]", "", "".join(groups))
        candidate = f"+{digits_only}"
        # Accept only plausible international lengths
        if (
            8 <= len(digits_only) <= 15
            and candidate not in _BLACKLIST_PHONES
            and not re.search(r"^\+1[01]", candidate)
        ):
            phones.add(candidate)

    # Emails
    emails: set[str] = set()
    for e in _EMAIL.findall(text):
        domain = e.split("@")[-1].lower()
        if (
            domain not in _SKIP_EMAIL_DOMAINS
            and not e.endswith((".png", ".jpg", ".svg", ".webp"))
            and "@2x" not in e
        ):
            emails.add(e.lower())

    return {"phones": sorted(phones), "emails": sorted(emails)}


def _extract_person_and_company(item: DiscoveryItem) -> tuple[str, str]:
    """Extract person name and company name from DiscoveryItem fields."""
    person = ""
    company = item.company or ""

    raw_title = item.title
    cleaned = re.sub(r"[^\w\s-]", " ", raw_title)
    cleaned = re.sub(
        r"\b(PMP|Dr|Mr|Ms|Mrs|Er|CA|CEO|CTO|CIO|VP|Head|Director|Manager|"
        r"Consultant|Architect|Lead)\b",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    words = cleaned.split()

    co_words = {
        "ltd", "llc", "inc", "pty", "corp", "solutions", "agency", "group",
        "partners", "consulting", "technologies", "systems", "services",
    }
    if 2 <= len(words) <= 4 and not any(w.lower() in co_words for w in words):
        person = " ".join(words)

    if not person and "linkedin.com/in/" in item.canonical_url:
        from urllib.parse import urlsplit  # noqa: PLC0415
        path = urlsplit(item.canonical_url).path
        slug = path.split("/in/")[-1].strip("/").split("/")[0]
        slug_clean = re.sub(r"-[0-9a-f]{6,}$|-[0-9]{6,}$", "", slug)
        parts = [p.capitalize() for p in slug_clean.split("-") if p and not p.isdigit()]
        if 2 <= len(parts) <= 4 and not any(p.lower() in co_words for p in parts):
            person = " ".join(parts)

    if not company and item.content:
        m = re.search(
            r"\bat\s+([A-Z][A-Za-z0-9&.\s]{2,30}?)(?:\s+in|\s+Ahmedabad|\s+Mumbai|[,\n|•])",
            item.content,
        )
        if m:
            candidate_comp = m.group(1).strip()
            if not any(w in candidate_comp.lower() for w in ("linkedin", "university", "school")):
                company = candidate_comp

    return person, company


def _build_ddg_queries(item: DiscoveryItem) -> list[str]:
    """Generate 2–3 targeted DuckDuckGo queries for the item."""
    person, company = _extract_person_and_company(item)
    parsed = urlsplit(item.canonical_url)
    domain = parsed.netloc.replace("www.", "")

    queries: list[str] = []

    if person:
        queries.append(f'"{person}" (phone OR mobile OR WhatsApp OR "contact")')
        queries.append(f'"{person}" (email OR "contact info" OR "@")')
        if company:
            queries.append(f'"{person}" "{company}" (phone OR mobile OR email)')
    elif company:
        queries.append(f'"{company}" (CEO OR Director OR "Head") (phone OR mobile OR email)')
        queries.append(f'"{company}" ("reach us" OR contact OR phone OR email)')
        if domain and not any(nd in domain for nd in _NO_CRAWL_DOMAINS):
            queries.append(f"site:{domain} (contact OR phone OR \"call us\")")

    if not queries:
        snippet = re.sub(r"[^\w\s]", " ", item.title)[:40].strip()
        queries.append(f'"{snippet}" contact phone email')

    return queries[:3]


def _infer_company_url(item: DiscoveryItem) -> str | None:
    """
    Infer the company's own website URL from the DiscoveryItem.
    Returns None if we can't determine a crawlable company URL.
    """
    parsed = urlsplit(item.canonical_url)
    domain = parsed.netloc.replace("www.", "")

    # Skip platforms — we want the company's OWN site
    if any(nd in domain for nd in _NO_CRAWL_DOMAINS):
        return None

    # If canonical_url is already a company site, use it
    return f"{parsed.scheme}://{parsed.netloc}"


# ── Public API ────────────────────────────────────────────────────────────────

def enrich_contact(item: DiscoveryItem) -> dict[str, Any]:
    """
    Run contact enrichment for a DiscoveryItem.

    Pipeline:
        1. Fast path: check item.content (already fetched, instant).
        2. Direct company website crawl — extracts tel: hrefs + JSON-LD
           (highest precision, misses nothing Exa could find, finds more).
        3. DuckDuckGo text queries — parallel, free, no API key.
        4. Pick best phone / email with location-aware heuristics.
    """
    # 1. Fast path
    contacts = _extract_contacts(item.content)
    phones: set[str] = set(contacts["phones"])
    emails: set[str] = set(contacts["emails"])

    # 2. Direct company website crawl
    company_url = _infer_company_url(item)
    if company_url:
        try:
            crawl_text = crawl_for_contacts(company_url, max_subpages=3)
            crawl_contacts = _extract_contacts(crawl_text)
            phones.update(crawl_contacts["phones"])
            emails.update(crawl_contacts["emails"])
        except Exception:  # noqa: BLE001
            pass

    # 3. DuckDuckGo queries (only if still missing phone)
    if not phones:
        queries = _build_ddg_queries(item)
        all_ddg_text = ""
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = {pool.submit(ddg_search, q, 8): q for q in queries}
            for future in as_completed(futures):
                try:
                    all_ddg_text += future.result() + "\n"
                except Exception:  # noqa: BLE001
                    pass
        if all_ddg_text:
            ext = _extract_contacts(all_ddg_text)
            phones.update(ext["phones"])
            emails.update(ext["emails"])

    # ── Pick best phone ──────────────────────────────────────────────────────
    def _pick_best_phone(phones_list: list[str]) -> str:
        if not phones_list:
            return ""
        ctx = f"{item.title} {item.company} {item.location} {item.content}".casefold()

        is_india = any(k in ctx for k in (
            "india", "gujarat", "ahmedabad", "mumbai", "delhi",
            "bengaluru", "hyderabad", "pune", "ncr",
        ))
        in_mobiles = [p for p in phones_list if p.startswith("+91") and len(p) == 13 and p[3] in "6789"]
        if in_mobiles and (is_india or not any(p.startswith("+1") for p in phones_list)):
            return in_mobiles[0]

        us_phones = [p for p in phones_list if p.startswith("+1") and len(p) == 12]
        if us_phones and any(k in ctx for k in (
            "us", "usa", "united states", "ca", "canada",
            "new york", "california", "texas",
        )):
            return us_phones[0]

        uk_phones = [p for p in phones_list if p.startswith("+44")]
        if uk_phones and any(k in ctx for k in ("uk", "united kingdom", "london", "england")):
            return uk_phones[0]

        au_phones = [p for p in phones_list if p.startswith("+61")]
        if au_phones and any(k in ctx for k in ("au", "australia", "sydney", "melbourne")):
            return au_phones[0]

        # Prefer structured-data phones (highest confidence)
        # tel: href and JSON-LD phones are already normalised in the text as TEL_HREF/JSONLD
        if in_mobiles:
            return in_mobiles[0]
        if us_phones:
            return us_phones[0]
        return phones_list[0]

    # ── Pick best email ──────────────────────────────────────────────────────
    def _pick_best_email(emails_list: list[str]) -> str:
        if not emails_list:
            return ""
        if item.company:
            comp_clean = re.sub(r"[^\w]", "", item.company).lower()
            for e in emails_list:
                domain_part = e.split("@")[-1].lower()
                if comp_clean and (comp_clean in domain_part or domain_part in comp_clean):
                    return e
        return emails_list[0]

    sorted_phones = sorted(phones)
    sorted_emails = sorted(emails)

    return {
        "phones": sorted_phones,
        "emails": sorted_emails,
        "best_phone": _pick_best_phone(sorted_phones),
        "best_email": _pick_best_email(sorted_emails),
        "enriched": True,
    }
