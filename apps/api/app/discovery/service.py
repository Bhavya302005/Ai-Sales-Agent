import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field

from app.conversation.script import QUALIFICATION_QUESTIONS
from app.discovery.connectors import FetchedSource, SourceCandidate
from app.discovery.exa_client import exa_search as _exa_raw
from app.persistence.models import ProductVersion

OpportunityType = Literal[
    "direct_requirement",
    "project_contract",
    "tender",
    "freelance_project",
    "hiring_signal",
    "weak_signal",
]


class DiscoveryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id: str = Field(min_length=1, max_length=500)
    canonical_url: str = Field(min_length=10, max_length=2048)
    source_type: str = Field(min_length=1, max_length=64)
    rights_note: str = Field(min_length=20, max_length=1000)
    published_at: datetime | None = None
    title: str = Field(min_length=1, max_length=500)
    company: str | None = Field(default=None, max_length=300)
    location: str | None = Field(default=None, max_length=300)
    opportunity_type: OpportunityType
    actionable: bool
    content: str = Field(min_length=20, max_length=12_000)
    provider_metadata: dict[str, Any] = Field(default_factory=dict)

    def fetched_source(self) -> FetchedSource:
        return FetchedSource(
            candidate=SourceCandidate(
                external_id=self.external_id,
                canonical_url=self.canonical_url,
                source_type=self.source_type,
                rights_note=self.rights_note,
                published_at=self.published_at,
                snapshot_ref=None,
                discovery_title=self.title,
                discovery_company=self.company,
                discovery_location=self.location,
                opportunity_type=self.opportunity_type,
                discovery_actionable=self.actionable,
                provider_metadata=self.provider_metadata,
            ),
            content=self.content.encode(),
        )


def load_demo_snapshot(repository_root: Path | None = None) -> list[DiscoveryItem]:
    root = repository_root or Path(__file__).resolve().parents[4]
    raw = json.loads((root / "tests/fixtures/discovery_snapshot.json").read_text())
    return [DiscoveryItem.model_validate(item) for item in raw]


def build_requirement_queries(product_version: ProductVersion) -> list[tuple[str, list[str]]]:
    """Return a list of (query_string, include_domains) tuples for buyer-intent discovery.

    Generates high-precision queries from the product version's ICP (needs,
    industries, geographies). Each tuple contains the raw search string and an
    optional domain-restriction list understood by the Exa MCP tool.
    """
    icp = product_version.icp if isinstance(product_version.icp, dict) else {}

    def clean(value: object) -> str:
        return re.sub(r"[^A-Za-z0-9&+ ./-]", " ", str(value)).strip()

    needs = [clean(v) for v in icp.get("needs", []) if clean(v)]
    industries = [clean(v) for v in icp.get("industries", []) if clean(v)][:2]
    locations = [clean(v) for v in icp.get("geographies", []) if clean(v)][:2]
    exclusions = [clean(v) for v in product_version.exclusions if clean(v)][:3]

    if not needs:
        words = re.findall(r"[A-Za-z0-9]+", product_version.description)
        needs = [" ".join(words[:6])]

    # Primary service string for neural queries
    primary = needs[0]
    # OR-joined quoted services for keyword queries
    svc_or = " OR ".join(f'"{n}"' for n in needs[:4])

    # Optional ICP context appended to queries
    icp_ctx = " ".join(
        part
        for part in (
            f"({' OR '.join(f'{i}' for i in industries)})" if industries else "",
            f"({' OR '.join(f'{loc}' for loc in locations)})" if locations else "",
        )
        if part
    )
    base_excl = [
        "we provide",
        "our services",
        "we built",
        "I built",
        "case study",
        "how to",
        "community article",
        "we are hiring",
        "job opening",
        "apply now",
        "resume",
        "clutch.co",
        "goodfirms.co",
        "exa.ai/library",
    ]
    excl = " ".join(f'-"{e}"' for e in exclusions + base_excl)

    def q(query: str) -> str:
        """Append ICP context and exclusions."""
        return " ".join(p for p in (query, icp_ctx, excl) if p)

    now = datetime.now(UTC)
    since = (now - timedelta(days=14)).date().isoformat()

    LI: list[str] = ["linkedin.com"]
    TW: list[str] = ["twitter.com", "x.com"]
    queries: list[tuple[str, list[str]]] = [
        # Require both a requester phrase and an external-provider phrase.
        (
            q(
                f'site:linkedin.com/posts ("looking for" OR "seeking") '
                f'("implementation partner" OR "agency" OR "vendor" OR "consulting firm") '
                f"({svc_or}) after:{since}"
            ),
            LI,
        ),
        (
            q(
                f'site:linkedin.com/posts ("recommend" OR "anyone know" OR "can anyone suggest") '
                f'("vendor" OR "agency" OR "implementation partner") ({svc_or}) after:{since}'
            ),
            LI,
        ),
        (
            q(
                f'site:linkedin.com/posts ("request for proposal" OR "invitation to bid" OR RFP) '
                f"({svc_or}) after:{since}"
            ),
            LI,
        ),
        (
            f"Find an original LinkedIn post published after {since} by a buying "
            f"organization explicitly requesting an external vendor, agency, consulting firm, "
            f"or implementation partner for {primary}. Exclude providers describing their own "
            "services, completed work, internal builds, personal profiles, and recruitment.",
            LI,
        ),
        (
            q(
                f'site:x.com OR site:twitter.com ("recommend" OR "looking for") '
                f'({svc_or}) ("agency" OR "implementation partner" OR "vendor") after:{since}'
            ),
            TW,
        ),
        (
            q(
                f'("request for proposal" OR "RFP" OR "tender") '
                f"({svc_or}) (open OR deadline OR bids OR proposals) after:{since}"
            ),
            [],
        ),
        (
            q(
                f'("request for quotation" OR "RFQ" OR "invitation to tender") '
                f"({svc_or}) after:{since}"
            ),
            [],
        ),
        (
            q(
                f'("looking for" OR "seeking") ("implementation partner" OR "agency" OR "vendor") '
                f"({svc_or}) after:{since}"
            ),
            [],
        ),
    ]
    return queries


def _opportunity_type(text: str) -> OpportunityType:
    lowered = text.casefold()
    if re.search(r"\b(rfp|request for proposal|tender)\b", lowered):
        return "tender"
    if re.search(r"\b(freelance|freelancer|short-term project)\b", lowered):
        return "freelance_project"
    if re.search(r"\b(hiring|job opening|apply now|vacancy)\b", lowered):
        return "hiring_signal"
    if re.search(r"\b(contract|project)\b", lowered):
        return "project_contract"
    if re.search(r"\b(looking for|seeking|requires?|needs?)\b", lowered):
        return "direct_requirement"
    return "weak_signal"


_CUTOFF_DAYS = 14

_BUYER_REQUEST_RE = re.compile(
    r"\b(looking for|seeking|request(?:ing)?|need(?:s|ed)?|recommend|invites?)\b",
    re.IGNORECASE,
)
_EXTERNAL_PROVIDER_RE = re.compile(
    r"\b(vendor|agency|implementation partner|consulting firm|consultant|service provider|"
    r"proposal|tender|bid|rfp|rfq|request for proposal|request for quotation)\b",
    re.IGNORECASE,
)
_RECRUITMENT_RE = re.compile(
    r"\b(we(?:'re| are) hiring|job opening|vacancy|apply now|resume|salary|joiners?|"
    r"years? of experience|full[- ]time|recruiter|staffing|candidate)\b",
    re.IGNORECASE,
)
_PROVIDER_PROMOTION_RE = re.compile(
    r"\b(we provide|we offer|our services|we built|i built|we deliver|we help|"
    r"case study|our integration stack|official .{0,30} partner|how to build|"
    r"building modern|thought leadership)\b",
    re.IGNORECASE,
)


def _is_original_buyer_request(url: str, title: str, content: str) -> bool:
    parsed = urlsplit(url)
    host = (parsed.hostname or "").casefold()
    path = parsed.path.casefold().rstrip("/")
    if host == "exa.ai" and path.startswith("/library/"):
        return False
    if "linkedin.com" in host and path.startswith("/in/"):
        return False
    if "freelancer.com" in host and path.startswith("/community/"):
        return False
    combined = f"{title}\n{content}"
    if _RECRUITMENT_RE.search(combined) or _PROVIDER_PROMOTION_RE.search(combined):
        return False
    return bool(_BUYER_REQUEST_RE.search(combined) and _EXTERNAL_PROVIDER_RE.search(combined))


def _parse_exa_text(text: str, query: str, *, now: datetime | None = None) -> list[DiscoveryItem]:
    items: list[DiscoveryItem] = []
    reference_time = now or datetime.now(UTC)
    cutoff = reference_time - timedelta(days=_CUTOFF_DAYS)
    for index, block in enumerate(re.split(r"\n---\n|\n-{3,}\n", text)):
        fields: dict[str, str] = {}
        for name in ("Title", "URL", "Published", "Author", "Highlights"):
            match = re.search(rf"^{name}:\s*(.+)$", block, re.MULTILINE)
            if match:
                fields[name] = match.group(1).strip()
        url = fields.get("URL", "")
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname:
            continue
        title = fields.get("Title") or "Public requirement result"
        content = (fields.get("Highlights") or block).strip()[:12_000]
        if len(content) < 20:
            continue
        if not _is_original_buyer_request(url, title, content):
            continue
        opportunity_type = _opportunity_type(f"{title}\n{content}")
        published_at = None
        if fields.get("Published"):
            try:
                published_at = datetime.fromisoformat(fields["Published"].replace("Z", "+00:00"))
                if published_at.tzinfo is None:
                    published_at = published_at.replace(tzinfo=UTC)
            except ValueError:
                published_at = None
        # Missing, future, and stale dates cannot establish a current requirement.
        if published_at is None or published_at < cutoff or published_at > reference_time:
            continue
        items.append(
            DiscoveryItem(
                external_id=f"exa:{index}:{url}",
                canonical_url=url,
                source_type="exa_live_search",
                rights_note=(
                    "Public search excerpt returned by Exa; original URL retained and no private "
                    "contact data stored."
                ),
                published_at=published_at,
                title=title,
                company=fields.get("Author"),
                opportunity_type=opportunity_type,
                actionable=opportunity_type
                in {"direct_requirement", "project_contract", "tender", "freelance_project"},
                content=content,
                provider_metadata={"query": query, "provider": "exa_mcp"},
            )
        )
    return items


def discover_with_exa(
    product_version: ProductVersion,
    *,
    timeout_seconds: int = 30,
    max_results: int = 30,
) -> list[DiscoveryItem]:
    """Run all buyer-intent queries against Exa in parallel and return deduplicated DiscoveryItems.

    Uses:
      • 22-query keyword engine (existing) — built from the product version's ICP
      • Exa Agent (new)               — multi-step agentic research with structured output

    Results older than _CUTOFF_DAYS are discarded before being returned.
    """
    thirty_ago = (datetime.now(UTC) - timedelta(days=_CUTOFF_DAYS)).strftime(
        "%Y-%m-%dT%H:%M:%S.000Z"
    )

    queries = build_requirement_queries(product_version)
    results: list[DiscoveryItem] = []
    seen: set[str] = set()

    def _execute_query(pair: tuple[str, list[str]]) -> tuple[str, str]:
        q_str, domains = pair
        try:
            raw = _exa_raw(
                q_str,
                num_results=10,
                include_domains=domains or None,
                start_published_date=thirty_ago,
            )
            return q_str, raw or ""
        except Exception:
            return q_str, ""

    def _execute_agent() -> list[DiscoveryItem]:
        """Run the Exa Agent and convert to DiscoveryItems."""
        try:
            from app.discovery.exa_agent import (  # noqa: PLC0415
                exa_agent_leads_to_discovery_items,
                run_exa_agent,
            )

            leads = run_exa_agent(product_version, max_leads=15)
            return exa_agent_leads_to_discovery_items(leads, query="exa_agent_discovery")
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=8) as pool:
        # Submit all keyword queries
        futures = [pool.submit(_execute_query, q) for q in queries]
        # Also submit the Exa Agent as a parallel task
        agent_future = pool.submit(_execute_agent)

        # Collect keyword query results
        for future in as_completed(futures):
            q_str, raw_text = future.result()
            if not raw_text:
                continue
            for item in _parse_exa_text(raw_text, q_str):
                if item.canonical_url in seen:
                    continue
                seen.add(item.canonical_url)
                results.append(item)
                if len(results) >= max_results:
                    break

        # Collect Exa Agent results (structured, higher quality — prepend so they rank first)
        try:
            agent_items = agent_future.result(timeout=min(timeout_seconds, 60))
            agent_items_new = [it for it in agent_items if it.canonical_url not in seen]
            for it in agent_items_new:
                seen.add(it.canonical_url)
            # Prepend agent results so they appear first (highest quality)
            results = agent_items_new + results
        except Exception:
            pass

    return results[:max_results]


def approved_questions() -> tuple[str, ...]:
    """Expose the shared question set for fixture validation without duplicating it."""
    return QUALIFICATION_QUESTIONS
