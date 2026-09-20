"""
discovery/company_intel_enricher.py
====================================
Market Intelligence enricher for any DiscoveryItem.

For every lead discovered, this module automatically researches the posting
company across 8 intelligence dimensions using Exa deep-search:

    1. Company Overview   — size, founded, HQ, description
    2. Funding & Investors — rounds, amounts, lead investors
    3. Tech Stack          — frameworks, cloud providers, SaaS tools
    4. Hiring Signals      — active job postings (intent + team structure)
    5. Competitors         — who they compete with (helps tailor the pitch)
    6. Recent News         — press releases, product launches, leadership changes
    7. Decision Makers     — C-suite / VP names + LinkedIn URLs
    8. Pain Signals        — reviews mentioning problems this product solves

Architecture:
  - 8 specialised Exa query groups, each yielding targeted raw text.
  - Parallel execution via ThreadPoolExecutor (max 4 workers).
  - Structured extraction via regex + heuristic NLP (no LLM required).
  - Result stored in SourceDocument.provider_metadata["market_intel"].
  - Fully non-blocking: called from a daemon thread in api.py, failures silently
    degrade to an empty intel dict so the lead always appears.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

if TYPE_CHECKING:
    from app.discovery.service import DiscoveryItem


# ── Constants ──────────────────────────────────────────────────────────────────

_MAX_WORKERS = 4

# Domains that routinely appear in Exa results but have no useful company intel
_NOISE_DOMAINS = {
    "google.com", "facebook.com", "youtube.com", "twitter.com", "x.com",
    "amazon.com", "apple.com", "microsoft.com", "linkedin.com",
}

# Known CMS / cloud / infra keywords for tech stack detection
_TECH_KEYWORDS: dict[str, list[str]] = {
    "cloud": ["AWS", "Azure", "GCP", "Google Cloud", "Cloudflare", "Vercel", "Heroku"],
    "frontend": ["React", "Next.js", "Vue", "Angular", "Nuxt", "Svelte", "TypeScript"],
    "backend": ["Node.js", "Django", "FastAPI", "Rails", "Laravel", "Spring Boot", "Go", "Rust"],
    "database": ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Supabase", "PlanetScale",
                 "DynamoDB", "Firestore", "Cassandra"],
    "crm": ["Salesforce", "HubSpot", "Zoho CRM", "Pipedrive", "Monday.com"],
    "ecommerce": ["Shopify", "WooCommerce", "Magento", "BigCommerce", "Squarespace"],
    "analytics": ["Mixpanel", "Amplitude", "Segment", "Heap", "Hotjar", "Datadog"],
    "payments": ["Stripe", "PayPal", "Braintree", "Square", "Razorpay", "Adyen"],
    "infra": ["Docker", "Kubernetes", "Terraform", "GitHub Actions", "CircleCI", "Jenkins"],
    "ai_ml": ["OpenAI", "Anthropic", "Hugging Face", "LangChain", "Pinecone", "Weaviate"],
}

# Funding round keywords + amounts
_ROUND_KEYWORDS = [
    "Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D",
    "Series E", "Series F", "IPO", "SPAC", "Angel", "Bridge", "Growth",
]
_AMOUNT_RE = re.compile(
    r"\$\s?(\d+(?:\.\d+)?)\s?(million|billion|M|B|K)\b", re.IGNORECASE
)

# C-suite / decision-maker title patterns
_DM_TITLES = [
    "CEO", "CTO", "CMO", "CFO", "COO", "CPO", "CISO",
    "VP of Sales", "VP of Engineering", "VP of Marketing",
    "Head of Procurement", "Head of Engineering", "Head of Product",
    "Director of", "Founder", "Co-founder", "Managing Director",
    "General Manager", "President",
]
_DM_RE = re.compile(
    r"([A-Z][a-zA-Z\-']{1,30}\s[A-Z][a-zA-Z\-']{1,30})"  # Full name
    r"[\s,]+(?:" + "|".join(re.escape(t) for t in _DM_TITLES) + r")",
    re.IGNORECASE,
)

# Company size heuristics
_SIZE_RE = re.compile(
    r"(\d+[\,\d]*)\s*(?:employees|staff|team members|people|headcount)",
    re.IGNORECASE,
)
_SIZE_RANGES = [
    (1, 10, "1–10"),
    (11, 50, "11–50"),
    (51, 200, "51–200"),
    (201, 500, "201–500"),
    (501, 1000, "501–1000"),
    (1001, 5000, "1001–5000"),
    (5001, 10000, "5001–10000"),
    (10001, float("inf"), "10000+"),
]

# LinkedIn URL pattern
_LI_RE = re.compile(r"https?://(?:www\.)?linkedin\.com/in/[\w\-]+")


# ── Data Model ─────────────────────────────────────────────────────────────────

@dataclass
class MarketIntel:
    """Structured market intelligence for a single company."""

    company_name: str = ""
    domain: str = ""

    # 1. Overview
    description: str = ""
    founded_year: str = ""
    headquarters: str = ""
    employee_count: str = ""       # e.g. "51–200"

    # 2. Funding
    latest_round: str = ""         # e.g. "Series B"
    total_raised: str = ""         # e.g. "$24M"
    investors: list[str] = field(default_factory=list)

    # 3. Tech Stack
    tech_stack: dict[str, list[str]] = field(default_factory=dict)  # category → tools

    # 4. Hiring
    open_roles: list[str] = field(default_factory=list)
    hiring_departments: list[str] = field(default_factory=list)

    # 5. Competitors
    competitors: list[str] = field(default_factory=list)

    # 6. News
    recent_news: list[dict[str, str]] = field(default_factory=list)  # [{title, url, date}]

    # 7. Decision Makers
    decision_makers: list[dict[str, str]] = field(default_factory=list)  # [{name, title, linkedin}]

    # 8. Pain Signals
    pain_signals: list[str] = field(default_factory=list)

    # Meta
    intel_sources: list[str] = field(default_factory=list)
    intel_confidence: str = "low"  # low | medium | high

    def to_dict(self) -> dict[str, Any]:
        """Serialise to a plain dict safe for JSON storage in provider_metadata."""
        return {
            "company_name": self.company_name,
            "domain": self.domain,
            "overview": {
                "description": self.description,
                "founded_year": self.founded_year,
                "headquarters": self.headquarters,
                "employee_count": self.employee_count,
            },
            "funding": {
                "latest_round": self.latest_round,
                "total_raised": self.total_raised,
                "investors": self.investors,
            },
            "tech_stack": self.tech_stack,
            "hiring": {
                "open_roles": self.open_roles,
                "departments": self.hiring_departments,
            },
            "competitors": self.competitors,
            "recent_news": self.recent_news[:5],
            "decision_makers": self.decision_makers[:5],
            "pain_signals": self.pain_signals[:5],
            "meta": {
                "sources": self.intel_sources,
                "confidence": self.intel_confidence,
            },
        }


# ── Core Exa helper ────────────────────────────────────────────────────────────

def _exa(query: str, num: int = 8, include_domains: list[str] | None = None) -> str:
    """Call Exa via mcporter and return concatenated raw text. Never raises."""
    exe = shutil.which("mcporter")
    if not exe:
        return ""
    args: dict[str, Any] = {"query": query, "numResults": num}
    if include_domains:
        args["includeDomains"] = include_domains
    try:
        proc = subprocess.run(
            [
                exe, "call", "exa.web_search_exa",
                "--output", "json",
                "--args", json.dumps(args),
                "--timeout", "25000",
                "--no-oauth",
            ],
            capture_output=True,
            check=False,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    if proc.returncode != 0 or not proc.stdout.strip():
        return ""
    try:
        data = json.loads(proc.stdout)
        return "\n".join(
            b["text"] for b in data.get("content", []) if b.get("type") == "text"
        )
    except Exception:
        return ""


# ── Per-dimension extractors ───────────────────────────────────────────────────

def _extract_tech_stack(text: str) -> dict[str, list[str]]:
    """Scan raw text for technology keywords grouped by category."""
    found: dict[str, list[str]] = {}
    for category, keywords in _TECH_KEYWORDS.items():
        hits = [kw for kw in keywords if re.search(rf"\b{re.escape(kw)}\b", text, re.IGNORECASE)]
        if hits:
            found[category] = list(dict.fromkeys(hits))  # dedup, preserve order
    return found


def _extract_funding(text: str) -> tuple[str, str, list[str]]:
    """Return (latest_round, total_raised, investors)."""
    found_rounds = [r for r in _ROUND_KEYWORDS if r.lower() in text.lower()]
    latest = found_rounds[-1] if found_rounds else ""

    amounts = _AMOUNT_RE.findall(text)
    total = f"${amounts[-1][0]}{amounts[-1][1].upper()}" if amounts else ""

    # Heuristic: capitalised words near "investor", "led by", "backed by"
    investor_re = re.compile(
        r"(?:led by|backed by|investors?[:\s]+|funded by)\s+"
        r"([A-Z][a-zA-Z &\.]{2,50})",
        re.IGNORECASE,
    )
    investors = list(dict.fromkeys(investor_re.findall(text)))[:5]

    return latest, total, investors


def _extract_decision_makers(text: str) -> list[dict[str, str]]:
    """Extract named decision makers with titles and optional LinkedIn URLs."""
    dms: list[dict[str, str]] = []
    for match in _DM_RE.finditer(text):
        name = match.group(1).strip()
        title_start = match.end(1)
        title_end = min(title_start + 60, len(text))
        title_snippet = text[title_start:title_end].strip().lstrip(",- ")
        # Find nearby LinkedIn URL
        nearby_text = text[max(0, match.start() - 200): match.end() + 200]
        li_match = _LI_RE.search(nearby_text)
        dms.append({
            "name": name,
            "title": title_snippet[:80],
            "linkedin": li_match.group(0) if li_match else "",
        })
    # Dedup by name
    seen: set[str] = set()
    unique: list[dict[str, str]] = []
    for dm in dms:
        if dm["name"] not in seen:
            seen.add(dm["name"])
            unique.append(dm)
    return unique[:8]


def _extract_employee_count(text: str) -> str:
    """Parse employee count and convert to a LinkedIn-style range."""
    matches = _SIZE_RE.findall(text)
    if not matches:
        return ""
    # Take largest number found (most likely the full-company headcount)
    try:
        count = max(int(m.replace(",", "")) for m in matches)
    except ValueError:
        return ""
    for lo, hi, label in _SIZE_RANGES:
        if lo <= count <= hi:
            return label
    return str(count)


def _extract_open_roles(text: str) -> tuple[list[str], list[str]]:
    """Return (role_titles, departments) from hiring signals text."""
    role_re = re.compile(
        r"(?:hiring|looking for|open role|position|vacancy)[:\s]+([A-Za-z\s/]{5,50}?)(?:\.|,|\n|$)",
        re.IGNORECASE,
    )
    roles = list(dict.fromkeys(m.strip() for m in role_re.findall(text)))[:10]
    dept_re = re.compile(
        r"\b(Engineering|Sales|Marketing|Product|Design|Finance|Operations|"
        r"Data Science|Legal|HR|Procurement|Customer Success)\b",
        re.IGNORECASE,
    )
    depts = list(dict.fromkeys(m.capitalize() for m in dept_re.findall(text)))[:6]
    return roles, depts


def _extract_competitors(text: str, company: str) -> list[str]:
    """Find competitor names from G2 / Capterra / comparison pages."""
    comp_re = re.compile(
        r"(?:vs\.?|versus|alternative to|compared to|competitor[s]?)[:\s]+"
        r"([A-Z][a-zA-Z0-9\s\.]{2,40}?)(?:\.|,|\n|$)",
        re.IGNORECASE,
    )
    raw = [m.strip() for m in comp_re.findall(text)]
    # Filter out the company itself
    return [c for c in raw if company.lower() not in c.lower()][:8]


def _extract_pain_signals(text: str) -> list[str]:
    """Pull review sentences mentioning a problem the product could solve."""
    pain_re = re.compile(
        r"([^.!?\n]*"
        r"(?:struggle[sd]?|painful|slow|expensive|lack|missing|broken|"
        r"manual process|error-prone|hard to scale|difficult to|"
        r"wish (?:they|we|it)|problem with|frustrating|clunky)"
        r"[^.!?\n]*[.!?])",
        re.IGNORECASE,
    )
    return list(dict.fromkeys(m.strip() for m in pain_re.findall(text)))[:6]


def _extract_recent_news(raw_text_with_meta: str) -> list[dict[str, str]]:
    """Pull title + url + date from structured Exa output blocks."""
    news: list[dict[str, str]] = []
    blocks = re.split(r"\n---\n|\n-{3,}\n", raw_text_with_meta)
    url_re = re.compile(r"URL:\s*(https?://\S+)")
    title_re = re.compile(r"Title:\s*(.+)")
    date_re = re.compile(r"Published:\s*(\S+)")
    for block in blocks:
        url_m = url_re.search(block)
        title_m = title_re.search(block)
        if url_m and title_m:
            news.append({
                "title": title_m.group(1).strip()[:120],
                "url": url_m.group(1).strip(),
                "date": date_re.search(block).group(1) if date_re.search(block) else "",
            })
    return news[:6]


# ── Query builders ─────────────────────────────────────────────────────────────

def _build_query_groups(company: str, domain: str) -> dict[str, tuple[str, list[str]]]:
    """
    Build 8 labelled Exa queries.
    Returns {label: (query_string, include_domains)}.
    """
    q = f'"{company}"'  # always wrap company in quotes

    return {
        "overview": (
            f'{q} company overview employees founded headquarters description',
            ["linkedin.com", "crunchbase.com", "bloomberg.com", "reuters.com"],
        ),
        "funding": (
            f'{q} funding round raised investors Series OR Seed OR Angel',
            ["crunchbase.com", "techcrunch.com", "bloomberg.com",
             "businesswire.com", "prnewswire.com"],
        ),
        "tech_stack": (
            f'{q} tech stack technology uses built with framework cloud infrastructure',
            ["builtwith.com", "stackshare.io", "github.com",
             f"{domain}" if domain else "g2.com"],
        ),
        "hiring": (
            f'{q} is hiring jobs open roles careers',
            ["linkedin.com", "indeed.com", "glassdoor.com",
             "lever.co", "greenhouse.io", "workday.com"],
        ),
        "competitors": (
            f'{q} competitors alternatives versus similar companies',
            ["g2.com", "capterra.com", "trustradius.com", "producthunt.com"],
        ),
        "news": (
            f'{q} news announcement launch partnership acquisition 2025 OR 2026',
            ["techcrunch.com", "bloomberg.com", "reuters.com",
             "businesswire.com", "prnewswire.com", "venturebeat.com"],
        ),
        "decision_makers": (
            f'site:linkedin.com/in {q} CEO OR CTO OR VP OR "Head of" OR Director OR Founder',
            ["linkedin.com"],
        ),
        "pain_signals": (
            f'{q} reviews problems complaints "wish they" OR struggle OR slow OR manual',
            ["g2.com", "trustpilot.com", "capterra.com", "reddit.com", "glassdoor.com"],
        ),
    }


# ── Main enrichment entry point ────────────────────────────────────────────────

def enrich_company_intel(item: "DiscoveryItem") -> dict[str, Any]:
    """
    Run all 8 market intelligence queries for the company behind a DiscoveryItem.

    Returns a dict keyed "market_intel" containing a fully structured MarketIntel
    dict. Safe to merge into SourceDocument.provider_metadata.

    If anything fails the function degrades gracefully and returns an empty
    intel dict — the lead always appears regardless.
    """
    company = (item.company or "").strip()
    if not company or company.lower() in {"n/a", "—", "unknown", ""}:
        # Try to extract company from title as fallback
        words = re.findall(r"[A-Z][a-z]+(?:\s[A-Z][a-z]+)*", item.title)
        company = words[0] if words else ""
    if not company:
        return {"market_intel": {}}

    domain = urlsplit(item.canonical_url).netloc.replace("www.", "")
    if domain in _NOISE_DOMAINS:
        domain = ""

    intel = MarketIntel(company_name=company, domain=domain)
    query_groups = _build_query_groups(company, domain)

    # ── Run all 8 groups in parallel ──────────────────────────────────────────
    raw: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as pool:
        futures = {
            pool.submit(_exa, q_str, 8, domains): label
            for label, (q_str, domains) in query_groups.items()
        }
        for future in as_completed(futures):
            label = futures[future]
            try:
                raw[label] = future.result()
            except Exception:
                raw[label] = ""

    # ── Extract per dimension ─────────────────────────────────────────────────

    # 1. Overview
    overview_text = raw.get("overview", "")
    size_match = _extract_employee_count(overview_text)
    intel.employee_count = size_match

    founded_re = re.search(r"\bfounded\s+(?:in\s+)?(\d{4})\b", overview_text, re.IGNORECASE)
    intel.founded_year = founded_re.group(1) if founded_re else ""

    hq_re = re.search(
        r"(?:headquartered|based|offices?)\s+(?:in\s+)?([A-Z][a-zA-Z\s,]{3,40})",
        overview_text, re.IGNORECASE,
    )
    intel.headquarters = hq_re.group(1).strip()[:60] if hq_re else ""

    # First non-trivial sentence as description
    sentences = [s.strip() for s in re.split(r"[.!?]", overview_text) if len(s.strip()) > 60]
    intel.description = sentences[0][:300] if sentences else ""

    # 2. Funding
    funding_text = raw.get("funding", "")
    intel.latest_round, intel.total_raised, intel.investors = _extract_funding(funding_text)

    # 3. Tech Stack
    tech_text = raw.get("tech_stack", "")
    intel.tech_stack = _extract_tech_stack(tech_text)

    # 4. Hiring
    hiring_text = raw.get("hiring", "")
    intel.open_roles, intel.hiring_departments = _extract_open_roles(hiring_text)

    # 5. Competitors
    comp_text = raw.get("competitors", "")
    intel.competitors = _extract_competitors(comp_text, company)

    # 6. News
    news_text = raw.get("news", "")
    intel.recent_news = _extract_recent_news(news_text)

    # 7. Decision Makers
    dm_text = raw.get("decision_makers", "")
    intel.decision_makers = _extract_decision_makers(dm_text)

    # 8. Pain Signals
    pain_text = raw.get("pain_signals", "")
    intel.pain_signals = _extract_pain_signals(pain_text)

    # ── Source attribution ────────────────────────────────────────────────────
    intel.intel_sources = [label for label, text in raw.items() if len(text) > 100]

    # ── Confidence scoring ────────────────────────────────────────────────────
    score = sum([
        bool(intel.description),
        bool(intel.employee_count),
        bool(intel.latest_round or intel.total_raised),
        bool(intel.tech_stack),
        bool(intel.decision_makers),
        bool(intel.recent_news),
    ])
    intel.intel_confidence = "high" if score >= 4 else ("medium" if score >= 2 else "low")

    return {"market_intel": intel.to_dict()}
