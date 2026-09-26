"""
discovery/exa_agent.py
======================
Exa Agent API integration for high-quality, structured lead discovery.

Unlike the basic exa_search() which runs keyword searches and returns raw text,
exa.agent.runs.create() performs multi-step agentic research and returns
structured JSON output defined by our schema.

The system prompt is fully dynamic — built from the product version's:
  • Company name, description, and website
  • ICP (needs, industries, geographies)
  • Services offered
  • Target customers
  • Exclusions
  • Qualification signals
"""

# ruff: noqa: E501 -- prompt/schema prose remains readable as complete instructions.

from __future__ import annotations

import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

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
_AGENT_TIMEOUT = 120.0
_POLL_INTERVAL = 3.0
_MAX_POLLS = 30

# ── Output schema ─────────────────────────────────────────────────────────────
LEAD_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "leads": {
            "type": "array",
            "description": "List of qualified leads found",
            "items": {
                "type": "object",
                "properties": {
                    "company_name": {"type": "string"},
                    "contact_name": {"type": "string"},
                    "contact_title": {"type": "string"},
                    "email": {"type": "string"},
                    "phone": {"type": "string"},
                    "contact_source_url": {
                        "type": "string",
                        "description": "Exact public page where the returned email or phone is visibly published.",
                    },
                    "contact_evidence": {
                        "type": "string",
                        "description": "Short source-backed text identifying the contact channel and tying it to the buyer organization or named contact.",
                    },
                    "company_website": {"type": "string"},
                    "company_linkedin": {"type": "string"},
                    "geography": {"type": "string"},
                    "industry": {"type": "string"},
                    "company_size": {"type": "string"},
                    "requirement": {"type": "string"},
                    "buying_intent_signal": {"type": "string"},
                    "buyer_evidence": {
                        "type": "string",
                        "description": "Source-backed evidence that the named company is the buyer/requester, not the service provider.",
                    },
                    "external_provider_evidence": {
                        "type": "string",
                        "description": "Source-backed evidence that the buyer is asking for an external vendor, agency, consultant, partner, proposal, or bid.",
                    },
                    "lead_role": {"type": "string", "enum": ["buyer", "provider", "unclear"]},
                    "requirement_status": {"type": "string", "enum": ["open", "unknown", "closed"]},
                    "external_provider_requested": {"type": "boolean"},
                    "source_url": {"type": "string"},
                    "published_date": {
                        "type": "string",
                        "description": "ISO 8601 format date (YYYY-MM-DD) when this lead or post was originally published. Crucial for recency check.",
                    },
                    "opportunity_type": {
                        "type": "string",
                        "enum": [
                            "direct_requirement",
                            "project_contract",
                            "tender",
                            "rfp",
                            "hiring_signal",
                            "weak_signal",
                        ],
                    },
                    "urgency": {"type": "string", "enum": ["high", "medium", "low", "unknown"]},
                    "fit_score": {"type": "integer", "minimum": 0, "maximum": 100},
                    "fit_reason": {"type": "string"},
                },
                "required": [
                    "company_name",
                    "email",
                    "phone",
                    "contact_source_url",
                    "contact_evidence",
                    "requirement",
                    "buying_intent_signal",
                    "buyer_evidence",
                    "external_provider_evidence",
                    "lead_role",
                    "requirement_status",
                    "external_provider_requested",
                    "source_url",
                    "published_date",
                    "opportunity_type",
                    "fit_score",
                    "fit_reason",
                ],
            },
        },
        "total_searched": {"type": "integer"},
        "search_summary": {"type": "string"},
    },
    "required": ["leads", "total_searched", "search_summary"],
}


def _build_system_prompt(product_version: Any) -> str:
    """Build a rich, fully dynamic system prompt from all product + ICP data."""
    facts = product_version.facts if isinstance(product_version.facts, dict) else {}
    icp = product_version.icp if isinstance(product_version.icp, dict) else {}
    exclusions = product_version.exclusions if isinstance(product_version.exclusions, list) else []

    company_url = facts.get("_company_url", "")
    services = facts.get("_services", [])
    target_customers = facts.get("_target_customers", [])
    ecosystem = facts.get("ecosystem", "")
    compliance = facts.get("compliance", "")
    location = facts.get("location", "")

    needs = icp.get("needs", [])
    industries = icp.get("industries", [])
    geographies = icp.get("geographies", [])

    # Extract website and sales doc excerpts from profile sources
    profile_sources = facts.get("_profile_sources", [])
    website_excerpt = ""
    sales_doc_excerpt = ""
    for src in profile_sources:
        if src.get("kind") == "website":
            website_excerpt = src.get("excerpt", "")
        elif src.get("kind") == "document":
            sales_doc_excerpt = src.get("excerpt", "")[:3000]

    company_description = product_version.description or ""

    prompt = f"""You are a conservative B2B buyer-intent researcher.
Your sole mission is to identify real organizations with a current, explicit request to BUY or OUTSOURCE work to an external provider whose capabilities match the approved client profile below.

The client profile is authoritative and changes for every workspace. Derive the target services, industries, organization types, geographies, and exclusions only from this profile. Do not assume that examples or defaults from another client apply.

== CLIENT PROFILE (THE SOLUTION PROVIDER) ==
Company: {facts.get("_company_name", "Solution Provider")}
Website: {company_url}
Headquarters: {location}
Technology Ecosystem: {ecosystem}
Core Services Offered:
{chr(10).join(f"- {s}" for s in services) if services else "- Not specified; do not infer capabilities"}
Company Overview: {company_description}
{f"Compliance & Certifications: {compliance}" if compliance else ""}
{f"Website Excerpt: {website_excerpt}" if website_excerpt else ""}
{f"Sales Overview: {sales_doc_excerpt}" if sales_doc_excerpt else ""}

== TARGET IDEAL CUSTOMER PROFILE (ICP) ==
Target Industries: {", ".join(industries) if industries else "Not specified; do not assume"}
Target Geographies: {", ".join(geographies) if geographies else "Not specified; do not assume"}
Target Organization Size: {", ".join(target_customers) if target_customers else "Not specified; do not assume"}
Specific Problems / Requirements We Solve:
{chr(10).join(f"- {n}" for n in needs) if needs else "- Not specified; use only approved services above"}

== STRICT EXCLUSIONS ==
{chr(10).join(f"- {e}" for e in exclusions)}
- HR, recruitment, job postings, careers pages, and job descriptions.
- Posts looking for "joiners", "candidates", "employees", "staff", or "years of experience".
- Aggregator and directory portals (Clutch, GoodFirms, G2, Yelp, ZoomInfo, DesignRush)
- Individuals posting resumes, portfolios, or looking for jobs/employment
- Agencies or service providers promoting or advertising their OWN capabilities
- Listicles and generic blog roundups (e.g., "Top 10 software companies")

== COMPETITOR REJECTION (CRITICAL) ==
You MUST NOT return our competitors! If a company offers the same or similar services as our Core Services, they are a competitor, NOT a lead.
We are looking for BUYERS who need these services, not PROVIDERS who offer them.

== WHAT COUNTS AS A LEAD ==
A result is a lead only when the source itself proves all of the following:
1. The named organization is the prospective buyer/requester.
2. It has a concrete requirement matching this client's approved services and ICP.
3. It explicitly seeks an EXTERNAL vendor, agency, consultant, implementation partner, proposal, tender response, or comparable business provider.
4. The requirement is recent and still open/current.

Reject provider marketing, portfolio posts, case studies, completed-project announcements, tutorials, thought leadership, generic topic discussion, directories, recommendation articles, and internal implementation updates. A person or company saying it performs, completed, launched, built, migrated, implemented, or offers the work is not a lead unless the same source explicitly asks an external provider for a separate current requirement.

Observed false-positive patterns that must be rejected:
- Educational or community articles whose title starts with or implies "Building", "How to", or a technology tutorial.
- Provider posts saying "we built", "I built", "we deliver", "we help", "our services", "our integration stack", or announcing a partnership/product/capability.
- Consultancies, agencies, freelancers, architects, and specialists describing what they offer or have delivered.
- Personal profile, resume, biography, employee-experience, or Exa library/person pages.
- General questions, opinions, trend commentary, or pain-point content that does not ask an external provider to respond.
- Staffing posts for a developer, analyst, specialist, consultant, contractor, candidate, or employee. The word "contract" alone never proves a B2B project.
- Freelancer community/blog pages. Only an original project/request page can qualify.

== QUALIFICATION AND ACCURACY PROTOCOL ==
1. BUYER VERIFICATION: The company_name MUST be the BUYING organization that needs to hire a B2B vendor/agency. Never set company_name to a social media handle, an agency pitching services, or a blog site.
2. NO RECRUITMENT/HIRING: If the post mentions "years of experience", "immediate joiners", "salary", "hiring", or "full-time", it is a job post. REJECT IT IMMEDIATELY. We strictly only want B2B contracts, projects, and RFPs.
3. BUYING INTENT: The lead must show verifiable commercial intent to outsource to a business/agency:
   - Active Request for Proposal (RFP), tender, or bid notice
   - Executive/Founder/Procurement post explicitly stating "looking for a vendor/partner/agency to help us build/migrate/audit..."
   - Project posting on professional B2B contract networks with verified enterprise budget
   - Organizational initiative announcing a technology modernization or outsourcing project
4. EVIDENCE PROVENANCE: requirement, buying_intent_signal, buyer_evidence, and external_provider_evidence must be supported by the requirement source URL. The source_url must be the exact post, RFP, tender, or request page—not a company homepage, provider page, search page, or inferred profile.
5. FIT SCORE: Rate 0-100 based strictly on the approved profile's service/need, industry, geography, organization, explicit intent, and recency. Return only leads with fit_score >= 60.
6. CONTACT GROUNDING: If an executive, founder, or project owner is mentioned in the post, capture their contact_name and contact_title. Otherwise leave as null. Do not invent fictitious contact details.
7. RECENCY: You must only return leads and opportunities posted within the last 14 days. Reject missing, unverifiable, future, older, completed, awarded, cancelled, or closed dates/requirements.
8. UNCERTAINTY: When buyer identity, outsourcing intent, fit, source evidence, publication date, or open status is unclear, reject the result. Do not fill gaps with assumptions.
9. OUTPUT LABELS: Set lead_role='buyer', external_provider_requested=true, and requirement_status='open' only when the source proves those claims. Provider or unclear results must not be returned.

== CONTACT DISCOVERY — REQUIRED SECOND STAGE ==
Only after a candidate passes every buyer, intent, fit, and recency rule above, research public contact information for that exact buying organization. This is part of the same Exa research run; do not use or assume data from any other enrichment provider.

For every returned lead:
1. Prefer BOTH a publicly published professional email and a callable phone number. At minimum, one of email or phone MUST be present; otherwise do not return the lead.
2. Search the original requirement/RFP/tender, its public attachments, and the buyer's official website contact, procurement, leadership, or team pages. A public official buyer page may be used as contact_source_url even when source_url remains the original requirement page.
3. Prefer the named request owner, procurement contact, relevant executive, founder, or department contact. If no person-level contact is publicly published, an official company procurement/general business email or phone is acceptable and must not be presented as a personal contact.
4. Copy contact values exactly as publicly displayed. Never infer an email pattern, guess a mailbox, manufacture a phone number, convert a company switchboard into a mobile number, or use a contact belonging to an aggregator, publisher, recruiter, competing provider, or similarly named company.
5. An email must have a syntactically valid address and belong to the buyer's official domain, or be explicitly published by the buyer in the original request. Reject masked, partial, example, disposable, or guessed emails.
6. A phone must include a country code when the source provides it. Prefer explicitly labelled mobile, direct, or WhatsApp numbers; otherwise retain an official business number without claiming it is mobile.
7. Set contact_source_url to the exact public page containing the returned contact value. Set contact_evidence to concise text that proves the value belongs to the buyer or named contact. Do not cite a search-results page or merely the company homepage unless the contact is visibly published there.
8. If email and phone come from different official pages, include both URLs in contact_source_url separated by a space and explain the mapping in contact_evidence.
9. Contact availability never rescues an otherwise weak lead. First prove a current buyer requirement; then prove at least one correctly associated contact channel. If either proof fails, reject the result."""

    return prompt


def _build_query(product_version: Any) -> str:
    """Build an in-depth agent search query targeting active commercial demand."""
    icp = product_version.icp if isinstance(product_version.icp, dict) else {}
    needs = icp.get("needs", [])
    industries = icp.get("industries", [])
    geographies = icp.get("geographies", [])

    facts = product_version.facts if isinstance(product_version.facts, dict) else {}
    raw_services = facts.get("_services", [])
    services = (
        [str(value).strip() for value in raw_services if str(value).strip()]
        if isinstance(raw_services, list)
        else []
    )
    requirements = needs or services or [product_version.description[:200]]
    requirement_str = "; ".join(requirements[:8])
    industry_str = (
        " or ".join(industries[:3]) if industries else "the profile's specified industries"
    )
    geo_str = " or ".join(geographies[:2]) if geographies else "the profile's specified geographies"

    return (
        f"Search for source-backed, currently open B2B requests related to these approved customer needs/services: {requirement_str}. "
        f"Look for buyers explicitly requesting an external vendor, agency, consultant, implementation partner, proposal, tender response, or bid. "
        f"Target companies in {industry_str} located in {geo_str}. "
        f"Use the active profile only; do not substitute another industry, geography, or service. "
        f"Reject companies promoting, providing, showcasing, discussing, or announcing completed work in those areas; they are providers or non-buyers. "
        f"Reject job posts, recruitment, directories, listicles, case studies, portfolios, tutorials, internal projects, completed/closed requests, and pages without a verifiable publication date. "
        f"Return only the original request page where the named buyer explicitly asks to buy or outsource one of: {requirement_str}. "
        f"For each otherwise-qualified buyer, perform a second Exa research pass over the original request and that buyer's official public pages to find both a professional email and phone when available. "
        f"At least one correctly sourced email or phone is mandatory; reject candidates with neither and never guess contact data."
    )


def _is_qualified_buyer_lead(lead: dict[str, Any], *, now: datetime | None = None) -> bool:
    """Apply deterministic gates after the model response; unknowns never pass as leads."""
    if lead.get("lead_role") != "buyer":
        return False
    if lead.get("external_provider_requested") is not True:
        return False
    if lead.get("requirement_status") != "open":
        return False
    if lead.get("opportunity_type") not in {"direct_requirement", "project_contract", "tender"}:
        return False
    if not all(
        str(lead.get(field, "")).strip()
        for field in (
            "company_name",
            "requirement",
            "buying_intent_signal",
            "buyer_evidence",
            "external_provider_evidence",
            "source_url",
        )
    ):
        return False
    if not str(lead["source_url"]).startswith("https://"):
        return False
    email = str(lead.get("email", "")).strip()
    phone = str(lead.get("phone", "")).strip()
    if not email and not phone:
        return False
    if email and ("@" not in email or "." not in email.rsplit("@", 1)[-1]):
        return False
    if phone and len("".join(character for character in phone if character.isdigit())) < 8:
        return False
    if not all(
        str(lead.get(field, "")).strip()
        for field in ("contact_source_url", "contact_evidence")
    ):
        return False
    if not all(
        url.startswith("https://")
        for url in str(lead["contact_source_url"]).split()
    ):
        return False
    try:
        score = int(lead.get("fit_score", 0))
        published = datetime.fromisoformat(str(lead["published_date"]).replace("Z", "+00:00"))
        if published.tzinfo is None:
            published = published.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return False
    reference_time = now or datetime.now(UTC)
    return score >= 60 and reference_time - timedelta(days=14) <= published <= reference_time


def run_exa_agent(
    product_version: Any,
    *,
    max_leads: int = 20,
) -> list[dict[str, Any]]:
    """
    Run the Exa Agent using the official exa_py SDK.
    Returns a list of structured lead dictionaries.
    """
    if not EXA_API_KEY:
        return []

    try:
        from exa_py import Exa  # noqa: PLC0415
    except ImportError:
        return []

    exa = Exa(api_key=EXA_API_KEY)
    system_prompt = _build_system_prompt(product_version)
    query = _build_query(product_version)

    try:
        # Step 1: Create agent run
        run = exa.agent.runs.create(
            query=query,
            system_prompt=system_prompt,
            output_schema=LEAD_OUTPUT_SCHEMA,
        )

        # Step 2: Poll until finished (using SDK built-in timeout_ms)
        completed_run = exa.agent.runs.poll_until_finished(
            run.id, timeout_ms=int(_AGENT_TIMEOUT * 1000)
        )

        if completed_run.status == "completed" and completed_run.output:
            structured = completed_run.output.structured
            if isinstance(structured, str):
                structured = json.loads(structured)

            leads = structured.get("leads", []) if isinstance(structured, dict) else []
            qualified = [
                lead for lead in leads if isinstance(lead, dict) and _is_qualified_buyer_lead(lead)
            ]
            return qualified[:max_leads]

    except Exception as exc:
        import logging

        logging.getLogger(__name__).warning("Exa agent run failed: %s", exc)

    return []


def exa_agent_leads_to_discovery_items(
    leads: list[dict[str, Any]],
    query: str = "exa_agent_discovery",
) -> list[Any]:
    """Convert Exa Agent lead dicts into DiscoveryItem objects for the pipeline."""
    from app.discovery.service import DiscoveryItem, OpportunityType

    items = []
    for i, lead in enumerate(leads):
        url = (
            lead.get("source_url", "")
            or lead.get("company_website", "")
            or lead.get("company_linkedin", "")
        )
        if not url or not url.startswith("https://"):
            continue

        parts = []
        for label, key in [
            ("Company", "company_name"),
            ("Contact", "contact_name"),
            ("Title", "contact_title"),
            ("Requirement", "requirement"),
            ("Buying Signal", "buying_intent_signal"),
            ("Location", "geography"),
            ("Buyer Evidence", "buyer_evidence"),
            ("External Provider Evidence", "external_provider_evidence"),
            ("Industry", "industry"),
            ("Company Size", "company_size"),
            ("Fit", "fit_reason"),
            ("Email", "email"),
            ("Phone", "phone"),
            ("Contact Source", "contact_source_url"),
            ("Contact Evidence", "contact_evidence"),
        ]:
            val = lead.get(key)
            if val:
                parts.append(f"{label}: {val}")

        content = "\n".join(parts) or lead.get("requirement", "Lead identified by Exa Agent.")

        opp_map: dict[str, OpportunityType] = {
            "direct_requirement": "direct_requirement",
            "project_contract": "project_contract",
            "tender": "tender",
            "rfp": "tender",
            "hiring_signal": "hiring_signal",
            "weak_signal": "weak_signal",
        }
        opp_type: OpportunityType = opp_map.get(
            lead.get("opportunity_type", "weak_signal"), "weak_signal"
        )

        try:
            item = DiscoveryItem(
                external_id=f"exa_agent:{i}:{url}",
                canonical_url=url,
                source_type="exa_agent_search",
                rights_note=(
                    "Public web profile or post found by Exa Agent; "
                    "original URL retained and no private contact data stored."
                ),
                published_at=datetime.fromisoformat(lead["published_date"].replace("Z", "+00:00"))
                if lead.get("published_date")
                else None,
                title=lead.get("company_name", "Lead identified by Exa Agent"),
                company=lead.get("company_name"),
                location=lead.get("geography"),
                opportunity_type=opp_type,
                actionable=opp_type in {"direct_requirement", "project_contract", "tender"},
                content=content[:12_000],
                provider_metadata={
                    "query": query,
                    "provider": "exa_agent",
                    "fit_score": lead.get("fit_score", 0),
                    "urgency": lead.get("urgency", "unknown"),
                    "emails": [lead["email"]] if lead.get("email") else [],
                    "phones": [lead["phone"]] if lead.get("phone") else [],
                    "best_email": lead.get("email", ""),
                    "best_phone": lead.get("phone", ""),
                    "enriched": bool(lead.get("email") or lead.get("phone")),
                    "contact_source_url": lead.get("contact_source_url", ""),
                    "contact_evidence": lead.get("contact_evidence", ""),
                },
            )
            items.append(item)
        except Exception:
            continue

    return items
