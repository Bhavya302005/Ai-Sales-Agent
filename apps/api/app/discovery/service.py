import json
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field

from app.conversation.script import QUALIFICATION_QUESTIONS
from app.discovery.connectors import FetchedSource, SourceCandidate
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


def build_requirement_queries(product_version: ProductVersion) -> tuple[str, ...]:
    icp = product_version.icp if isinstance(product_version.icp, dict) else {}

    def clean(value: object) -> str:
        return re.sub(r"[^A-Za-z0-9&+ ./-]", " ", str(value)).strip()

    needs = [clean(value) for value in icp.get("needs", []) if clean(value)]
    industries = [clean(value) for value in icp.get("industries", []) if clean(value)][:2]
    locations = [clean(value) for value in icp.get("geographies", []) if clean(value)][:2]
    exclusions = [clean(value) for value in product_version.exclusions if clean(value)][:3]
    if not needs:
        words = re.findall(r"[A-Za-z0-9]+", product_version.description)
        needs = [" ".join(words[:6])]
    phrases = needs[:3]
    icp_filter = " ".join(
        part
        for part in (
            f"({' OR '.join(f'\"{item}\"' for item in industries)})" if industries else "",
            f"({' OR '.join(f'\"{item}\"' for item in locations)})" if locations else "",
        )
        if part
    )
    exclusion_filter = " ".join(f'-"{item}"' for item in exclusions)
    return tuple(
        " ".join(part for part in (query, icp_filter, exclusion_filter) if part)
        for need in phrases
        for query in (
            f'"looking for" "{need}" (partner OR vendor OR agency)',
            f'"{need}" (RFP OR tender OR "implementation partner")',
        )
    )[:6]


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


def _parse_exa_text(text: str, query: str) -> list[DiscoveryItem]:
    items: list[DiscoveryItem] = []
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
    product_version: ProductVersion, *, timeout_seconds: int = 25, max_results: int = 10
) -> list[DiscoveryItem]:
    executable = shutil.which("mcporter")
    if executable is None:
        raise RuntimeError("mcporter is not installed")
    results: list[DiscoveryItem] = []
    seen: set[str] = set()
    for query in build_requirement_queries(product_version)[:2]:
        args = {
            "query": query,
            "numResults": min(5, max_results),
            "objective": "Find recent public business requirements seeking an external provider.",
        }
        completed = subprocess.run(
            [
                executable,
                "call",
                "exa.web_search_exa",
                "--output",
                "json",
                "--args",
                json.dumps(args),
                "--timeout",
                str(timeout_seconds * 1000),
                "--no-oauth",
            ],
            capture_output=True,
            check=False,
            text=True,
            timeout=timeout_seconds,
        )
        if completed.returncode != 0:
            raise RuntimeError("Exa MCP discovery failed")
        if len(completed.stdout) > 1_000_000:
            raise RuntimeError("Exa MCP response exceeded the safety limit")
        payload = json.loads(completed.stdout)
        text = "\n".join(
            str(block.get("text", ""))
            for block in payload.get("content", [])
            if block.get("type") == "text"
        )
        for item in _parse_exa_text(text, query):
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
