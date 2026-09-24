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
            sales_doc_excerpt = src.get("excerpt", "")[:600]

    company_description = product_version.description or ""

    prompt = f"""You are a B2B lead generation specialist. Your job is to find real, high-intent leads for the company below.

== COMPANY PROFILE ==
Description: {company_description}
Website: {company_url}
Headquarters: {location}
Technology Ecosystem: {ecosystem}
{f"Compliance: {compliance}" if compliance else ""}

== WEBSITE CONTENT ==
{website_excerpt}

== SALES OVERVIEW ==
{sales_doc_excerpt}

== SERVICES OFFERED ==
{chr(10).join(f"- {s}" for s in services)}

== IDEAL CUSTOMER PROFILE ==
Target Industries: {", ".join(industries)}
Target Geographies: {", ".join(geographies)}
Target Company Size: {", ".join(target_customers) if target_customers else "Mid-market to Enterprise (200-5000 employees)"}
Core Needs We Solve:
{chr(10).join(f"- {n}" for n in needs)}

== DO NOT INCLUDE (Exclusions) ==
{chr(10).join(f"- {e}" for e in exclusions)}

== YOUR TASK ==
Search LinkedIn posts/profiles, Twitter/X, Reddit, Upwork, freelancer boards, RFP/tender boards, and company websites.
Find REAL companies or decision-makers who are ACTIVELY looking to buy services we offer.

STRICT RULES:
1. Only include COMPANIES buying services — NOT individuals seeking employment
2. Must match at least one target industry or geography
3. Must show clear buying intent (see signals below)
4. Only return leads with fit_score >= 50
5. Include email/phone only if publicly visible on the page

HIGH INTENT signals (include these):
- "Looking for a partner/vendor/agency/consulting firm"
- "RFP / Request for Proposal / Tender"
- "Need help with [service we offer]"
- "Evaluating vendors" / "DMs open" / "Reach out if you can help"
- "Hiring a consulting firm" or "outsourcing to agency"

EXCLUDE (no intent):
- Individuals posting their resume or portfolio
- Thought leadership posts with no buying call-to-action
- Companies advertising their OWN services
- Job seekers / freelancers looking for work"""

    return prompt


def _build_query(product_version: Any) -> str:
    """Build the agent search query from the product ICP."""
    icp = product_version.icp if isinstance(product_version.icp, dict) else {}
    needs = icp.get("needs", [])
    industries = icp.get("industries", [])
    geographies = icp.get("geographies", [])

    primary_service = needs[0] if needs else product_version.description[:100]
    industry_str = " or ".join(industries[:3]) if industries else "enterprise"
    geo_str = " or ".join(geographies[:2]) if geographies else "India"

    return (
        f"Find companies in {industry_str} industries located in {geo_str} "
        f"that are actively seeking a partner, agency, or vendor for: {primary_service}. "
        f"Also search for related needs: {', '.join(needs[1:4])}. "
        f"Search LinkedIn, Twitter, Reddit, Upwork, RFP boards, and company websites. "
        f"Return structured lead data with company name, contact, requirement, and buying intent signal."
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
        
        # Step 2: Poll until finished (using SDK built-in)
        completed_run = exa.agent.runs.poll_until_finished(run.id, timeout=_AGENT_TIMEOUT)
        
        if completed_run.status == "completed" and completed_run.output:
            structured = completed_run.output.structured
            if isinstance(structured, str):
                structured = json.loads(structured)
                
            leads = structured.get("leads", [])
            qualified = [
                lead for lead in leads
                if isinstance(lead, dict) and lead.get("fit_score", 0) >= 50
            ]
            return qualified[:max_leads]
            
    except Exception:
        pass

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
