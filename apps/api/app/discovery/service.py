import json
import re
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

    Generates 22 multi-platform queries from the product version's ICP (needs,
    industries, geographies).  Each tuple contains the raw search string and an
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
    excl = " ".join(f'-"{e}"' for e in exclusions)

    def q(query: str) -> str:
        """Append ICP context and exclusions."""
        return " ".join(p for p in (query, icp_ctx, excl) if p)

    now = datetime.now(UTC)
    this_month = now.strftime("%B %Y")
    last_month = (now - timedelta(days=30)).strftime("%B %Y")
    year = now.strftime("%Y")

    LI: list[str] = ["linkedin.com"]
    TW: list[str] = ["twitter.com", "x.com"]
    RD: list[str] = ["reddit.com"]
    UP: list[str] = ["upwork.com"]
    FL: list[str] = ["freelancer.com"]

    queries: list[tuple[str, list[str]]] = [
        # ── LinkedIn exact buyer-intent ───────────────────────────────────
        (q(f'site:linkedin.com/posts ("looking for" OR "seeking") '
           f'("implementation partner" OR "trusted partner" OR "agency" OR "vendor") '
           f'({svc_or}) "{this_month}"'), LI),
        (q(f'site:linkedin.com/posts ("looking for" OR "seeking") '
           f'("implementation partner" OR "trusted partner" OR "agency") '
           f'({svc_or}) "{last_month}"'), LI),
        (q(f'site:linkedin.com/posts ("DMs open" OR "referrals welcome" OR "comment below") '
           f'({svc_or}) "{year}"'), LI),
        (q(f'site:linkedin.com/posts ("recommend" OR "anyone know" OR "can anyone suggest") '
           f'({svc_or}) partner OR agency "{year}"'), LI),
        (q(f'site:linkedin.com/posts ("need help" OR "need to build" OR "need to migrate") '
           f'({svc_or}) "{year}"'), LI),
        (q(f'site:linkedin.com/posts ("hiring" OR "looking to hire") '
           f'("agency" OR "consulting firm" OR "partner company") ({svc_or}) "{year}"'), LI),
        # ── LinkedIn neural ───────────────────────────────────────────────
        (f"A company posted in {this_month} on LinkedIn that they are looking for a "
         f"{primary} implementation partner or agency to help with an upcoming project:", LI),
        (f"In {last_month} a business posted on LinkedIn that they need an agency or "
         f"consulting firm to help them with {primary}:", LI),
        (f"Here is a {this_month} LinkedIn post from a company looking to hire a "
         f"developer or agency to build or implement {primary}:", LI),
        # ── Twitter / X ───────────────────────────────────────────────────
        (q(f'site:x.com OR site:twitter.com ("recommend" OR "looking for") '
           f'({svc_or}) ("agency" OR "partner" OR "vendor") "{this_month}" OR "{last_month}"'), TW),
        (q(f'site:x.com OR site:twitter.com '
           f'("need help" OR "looking for someone" OR "hiring") ({svc_or}) "{year}"'), TW),
        # ── Reddit ────────────────────────────────────────────────────────
        (q(f'site:reddit.com '
           f'("looking for" OR "need a consultant" OR "recommend a partner" '
           f'OR "vendor recommendation") ({svc_or}) "{year}"'), RD),
        (q(f'site:reddit.com '
           f'("best agency" OR "good MSP" OR "reliable vendor") ({svc_or}) "{year}"'), RD),
        (q(f'site:reddit.com ("need help" OR "looking to hire") ({svc_or}) "{year}"'), RD),
        # ── Upwork ────────────────────────────────────────────────────────
        (q(f'site:upwork.com/jobs ({svc_or}) "{year}"'), UP),
        (q(f'site:upwork.com ("We are looking for" OR "seeking") ({svc_or}) "{year}"'), UP),
        # ── Freelancer ────────────────────────────────────────────────────
        (q(f'site:freelancer.com/projects ({svc_or}) "{this_month}"'), FL),
        (q(f'site:freelancer.com/projects ({svc_or}) "{last_month}"'), FL),
        # ── RFP boards ───────────────────────────────────────────────────
        (q(f'("request for proposal" OR "RFP" OR "tender") '
           f'({svc_or}) "{this_month}" OR "{last_month}"'), []),
        (q(f'("request for proposal" OR "RFP" OR "invitation to tender") '
           f'({svc_or}) "{year}"'), []),
        # ── General web ───────────────────────────────────────────────────
        (q(f'("looking for" OR "seeking") ("implementation partner" OR "agency" OR "vendor") '
           f'({svc_or}) "{this_month}"'), []),
        (q(f'("need help with" OR "looking for help" OR "seeking expertise") '
           f'({svc_or}) company OR business OR organization "{year}"'), []),
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


_CUTOFF_DAYS = 30


def _parse_exa_text(text: str, query: str) -> list[DiscoveryItem]:
    items: list[DiscoveryItem] = []
    cutoff = datetime.now(UTC) - timedelta(days=_CUTOFF_DAYS)
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
        opportunity_type = _opportunity_type(f"{title}\n{content}")
        published_at = None
        if fields.get("Published"):
            try:
                published_at = datetime.fromisoformat(
                    fields["Published"].replace("Z", "+00:00")
                )
            except ValueError:
                published_at = None
        # ── Strict 30-day date gate ──────────────────────────────────────
        if published_at is not None and published_at < cutoff:
            continue  # result is older than CUTOFF_DAYS — discard
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
    """Run all buyer-intent queries against Exa and return deduplicated DiscoveryItems.

    Uses the multi-platform 22-query engine built from the product version's ICP.
    Results older than _CUTOFF_DAYS are discarded before being returned.
    """
    thirty_ago = (
        datetime.now(UTC) - timedelta(days=_CUTOFF_DAYS)
    ).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    results: list[DiscoveryItem] = []
    seen: set[str] = set()

    for query_str, include_domains in build_requirement_queries(product_version):
        raw_text = _exa_raw(
            query_str,
            num_results=10,
            include_domains=include_domains or None,
            start_published_date=thirty_ago,
        )
        if not raw_text:
            continue
        for item in _parse_exa_text(raw_text, query_str):
            if item.canonical_url in seen:
                continue
            seen.add(item.canonical_url)
            results.append(item)
            if len(results) >= max_results:
                return results
    return results


def approved_questions() -> tuple[str, ...]:
    """Expose the shared question set for fixture validation without duplicating it."""
    return QUALIFICATION_QUESTIONS
