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

from __future__ import annotations

import json
import os
import time
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
                    "company_website": {"type": "string"},
                    "company_linkedin": {"type": "string"},
                    "geography": {"type": "string"},
                    "industry": {"type": "string"},
                    "company_size": {"type": "string"},
                    "requirement": {"type": "string"},
                    "buying_intent_signal": {"type": "string"},
                    "source_url": {"type": "string"},
                    "opportunity_type": {
                        "type": "string",
                        "enum": ["direct_requirement", "project_contract", "tender", "rfp", "hiring_signal", "weak_signal"]
                    },
                    "urgency": {
                        "type": "string",
                        "enum": ["high", "medium", "low", "unknown"]
                    },
                    "fit_score": {"type": "integer", "minimum": 0, "maximum": 100},
                    "fit_reason": {"type": "string"}
                },
                "required": ["company_name", "requirement", "buying_intent_signal", "source_url", "opportunity_type", "fit_score", "fit_reason"]
            }
        },
        "total_searched": {"type": "integer"},
        "search_summary": {"type": "string"}
    },
    "required": ["leads", "total_searched", "search_summary"]
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

    prompt = f"""You are an elite B2B Enterprise Lead Intelligence Specialist and Procurement Opportunity Scout.
Your sole mission is to identify real, verified companies that are actively seeking external vendors, partners, or consulting agencies to solve their commercial needs.

== CLIENT PROFILE (THE SOLUTION PROVIDER) ==
Company: {facts.get('_company_name', 'Solution Provider')}
Website: {company_url}
Headquarters: {location}
Technology Ecosystem: {ecosystem}
Core Services Offered:
{chr(10).join(f"- {s}" for s in services)}
Company Overview: {company_description}
{f"Compliance & Certifications: {compliance}" if compliance else ""}
{f"Website Excerpt: {website_excerpt}" if website_excerpt else ""}
{f"Sales Overview: {sales_doc_excerpt}" if sales_doc_excerpt else ""}

== TARGET IDEAL CUSTOMER PROFILE (ICP) ==
Target Industries: {", ".join(industries) if industries else "Technology, Finance, Healthcare, Manufacturing, Retail"}
Target Geographies: {", ".join(geographies) if geographies else "India, North America, Global"}
Target Organization Size: {", ".join(target_customers) if target_customers else "Growth companies, Mid-Market, and Enterprises (50 to 5000+ employees)"}
Specific Problems / Requirements We Solve:
{chr(10).join(f"- {n}" for n in needs)}

== STRICT EXCLUSIONS ==
{chr(10).join(f"- {e}" for e in exclusions)}
- HR, recruitment, job postings, careers pages, and job descriptions.
- Posts looking for "joiners", "candidates", "employees", "staff", or "years of experience".
- Aggregator and directory portals (Clutch, GoodFirms, G2, Yelp, ZoomInfo, DesignRush)
- Individuals posting resumes, portfolios, or looking for jobs/employment
- Agencies or service providers promoting or advertising their OWN capabilities
- Listicles and generic blog roundups (e.g., "Top 10 software companies")

== QUALIFICATION AND ACCURACY PROTOCOL ==
1. BUYER VERIFICATION: The company_name MUST be the BUYING organization that needs to hire a B2B vendor/agency. Never set company_name to a social media handle, an agency pitching services, or a blog site.
2. NO RECRUITMENT/HIRING: If the post mentions "years of experience", "immediate joiners", "salary", "hiring", or "full-time", it is a job post. REJECT IT IMMEDIATELY. We strictly only want B2B contracts, projects, and RFPs.
3. BUYING INTENT: The lead must show verifiable commercial intent to outsource to a business/agency:
   - Active Request for Proposal (RFP), tender, or bid notice
   - Executive/Founder/Procurement post explicitly stating "looking for a vendor/partner/agency to help us build/migrate/audit..."
   - Project posting on professional B2B contract networks with verified enterprise budget
   - Organizational initiative announcing a technology modernization or outsourcing project
4. EVIDENCE PROVENANCE: The requirement and buying_intent_signal fields must contain factual, verifiable excerpts from the source URL.
5. FIT SCORE: Rate 0-100 based strictly on industry match, geography match, and explicit budget/need alignment. Return only leads with fit_score >= 60.
6. CONTACT GROUNDING: If an executive, founder, or project owner is mentioned in the post, capture their contact_name and contact_title. Otherwise leave as null. Do not invent fictitious contact details.
7. RECENCY: You must only return leads and opportunities posted within the last 14 days. Reject any posts or RFPs older than 14 days, as they are no longer active commercial needs."""

    return prompt


def _build_query(product_version: Any) -> str:
    """Build an in-depth agent search query targeting active commercial demand."""
    icp = product_version.icp if isinstance(product_version.icp, dict) else {}
    needs = icp.get("needs", [])
    industries = icp.get("industries", [])
    geographies = icp.get("geographies", [])

    primary_service = needs[0] if needs else product_version.description[:100]
    secondary_services = ", ".join(needs[1:4]) if len(needs) > 1 else primary_service
    industry_str = " or ".join(industries[:3]) if industries else "enterprise"
    geo_str = " or ".join(geographies[:2]) if geographies else "India"

    return (
        f"Find RECENT (posted within the last 14 days) corporate buyers, enterprises, and funded startups in {industry_str} located in {geo_str} "
        f"that have an active commercial need or are actively seeking an external agency, implementation partner, or B2B vendor for: {primary_service}. "
        f"Related requirements to consider: {secondary_services}. "
        f"Search RECENT executive LinkedIn posts (from the last 14 days), corporate procurement RFPs, verified B2B client project bids, and company announcements. "
        f"CRITICAL: Strictly exclude all job postings, HR recruitment, hiring for 'joiners' or 'candidates', directory sites, and agencies advertising their own services. We only want B2B outsourcing and vendor procurement. "
        f"Return verified company names, requirement details, source URLs, and buying intent rationale."
    )


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
                lead for lead in leads
                if isinstance(lead, dict) and lead.get("fit_score", 0) >= 50
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
            ("Company", "company_name"), ("Contact", "contact_name"),
            ("Title", "contact_title"), ("Requirement", "requirement"),
            ("Buying Signal", "buying_intent_signal"), ("Location", "geography"),
            ("Industry", "industry"), ("Company Size", "company_size"),
            ("Fit", "fit_reason"), ("Email", "email"), ("Phone", "phone"),
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
                published_at=None,
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
                },
            )
            items.append(item)
        except Exception:
            continue

    return items
