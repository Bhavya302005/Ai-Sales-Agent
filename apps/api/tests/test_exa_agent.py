from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.discovery.exa_agent import (
    _build_query,
    _build_system_prompt,
    _is_qualified_buyer_lead,
)
from app.discovery.exa_client import _exa_api_search
from app.discovery.service import _parse_exa_text, build_requirement_queries

NOW = datetime(2026, 9, 25, 12, tzinfo=UTC)


def _profile(
    *,
    company: str,
    service: str,
    need: str,
    industry: str,
    geography: str,
) -> SimpleNamespace:
    return SimpleNamespace(
        description=f"{company} provides {service}.",
        icp={
            "needs": [need],
            "industries": [industry],
            "geographies": [geography],
        },
        exclusions=["Consumer-only requests"],
        facts={
            "_company_name": company,
            "_company_url": f"https://{company.casefold()}.example",
            "_services": [service],
            "_target_customers": ["Approved target organizations"],
        },
    )


def _lead(**overrides: object) -> dict[str, object]:
    lead: dict[str, object] = {
        "company_name": "Buyer Corp",
        "requirement": "Needs an external implementation partner",
        "buying_intent_signal": "Invites implementation proposals",
        "buyer_evidence": "Buyer Corp invites proposals",
        "external_provider_evidence": "seeking an external implementation partner",
        "lead_role": "buyer",
        "requirement_status": "open",
        "external_provider_requested": True,
        "source_url": "https://buyer.example/rfp/42",
        "published_date": (NOW - timedelta(days=2)).date().isoformat(),
        "opportunity_type": "tender",
        "fit_score": 84,
    }
    lead.update(overrides)
    return lead


def test_prompt_and_query_are_generated_from_each_active_profile() -> None:
    erp = _profile(
        company="CloudNorth",
        service="ERP cloud migration",
        need="Replace an on-premise ERP",
        industry="Manufacturing",
        geography="Germany",
    )
    design = _profile(
        company="StudioSouth",
        service="Ecommerce UX design",
        need="Improve online checkout conversion",
        industry="Retail",
        geography="Australia",
    )

    erp_context = _build_system_prompt(erp) + _build_query(erp)
    design_context = _build_system_prompt(design) + _build_query(design)

    assert "ERP cloud migration" in erp_context
    assert "Replace an on-premise ERP" in erp_context
    assert "Manufacturing" in erp_context
    assert "Germany" in erp_context
    assert "Ecommerce UX design" not in erp_context

    assert "Ecommerce UX design" in design_context
    assert "Improve online checkout conversion" in design_context
    assert "Retail" in design_context
    assert "Australia" in design_context
    assert "ERP cloud migration" not in design_context


def test_prompt_defines_buyer_not_provider_and_requires_source_proof() -> None:
    prompt = _build_system_prompt(
        _profile(
            company="CloudNorth",
            service="ERP cloud migration",
            need="Replace an on-premise ERP",
            industry="Manufacturing",
            geography="Germany",
        )
    )

    assert "prospective buyer/requester" in prompt
    assert "explicitly seeks an EXTERNAL vendor" in prompt
    assert "completed-project announcements" in prompt
    assert "source_url must be the exact post, RFP, tender, or request page" in prompt
    assert "When buyer identity, outsourcing intent" in prompt


def test_acceptance_gate_requires_buyer_outsourcing_open_recent_and_fit() -> None:
    assert _is_qualified_buyer_lead(_lead(), now=NOW)

    assert not _is_qualified_buyer_lead(_lead(lead_role="provider"), now=NOW)
    assert not _is_qualified_buyer_lead(_lead(external_provider_requested=False), now=NOW)
    assert not _is_qualified_buyer_lead(_lead(requirement_status="closed"), now=NOW)
    assert not _is_qualified_buyer_lead(_lead(buyer_evidence=""), now=NOW)
    assert not _is_qualified_buyer_lead(_lead(published_date=""), now=NOW)
    assert not _is_qualified_buyer_lead(
        _lead(published_date=(NOW - timedelta(days=15)).date().isoformat()), now=NOW
    )
    assert not _is_qualified_buyer_lead(_lead(fit_score=59), now=NOW)


def test_keyword_queries_are_profile_driven_and_avoid_noisy_intent_terms() -> None:
    profile = _profile(
        company="CloudNorth",
        service="ERP cloud migration",
        need="Replace an on-premise ERP",
        industry="Manufacturing",
        geography="Germany",
    )

    queries = "\n".join(query for query, _domains in build_requirement_queries(profile))

    assert "Replace an on-premise ERP" in queries
    assert "Manufacturing" in queries
    assert "Germany" in queries
    assert '"we built"' in queries
    assert '"we are hiring"' in queries
    assert '"looking to hire"' not in queries
    assert "site:freelancer.com" not in queries
    assert "site:upwork.com" not in queries


def test_keyword_parser_keeps_only_recent_original_buyer_requests() -> None:
    published = (NOW - timedelta(days=2)).isoformat()
    valid = (
        "Title: Buyer Corp is seeking an ERP implementation partner\n"
        "URL: https://www.linkedin.com/posts/buyer-corp_rfp-123\n"
        f"Published: {published}\n"
        "Buyer Corp is seeking an external vendor and invites proposals for its ERP migration."
    )
    noisy_blocks = [
        (
            "Building Modern Full-Stack Applications",
            "https://www.freelancer.com/community/articles/building-modern-apps",
            "This tutorial explains how to build modern applications for clients.",
        ),
        (
            "An enterprise AI application built in 72 hours",
            "https://www.linkedin.com/posts/provider_showcase-456",
            "We built and deliver enterprise AI applications for organizations.",
        ),
        (
            "Cloud Architect",
            "https://www.linkedin.com/in/cloud-architect",
            "Consultant seeking partners and helping clients migrate systems.",
        ),
        (
            "Immediate AI developer contract opportunity",
            "https://www.linkedin.com/posts/recruiter_job-789",
            "We are hiring a candidate with five years of experience. Apply now.",
        ),
        (
            "Can AI build an ERP?",
            "https://www.linkedin.com/posts/commentary_question-101",
            "A general discussion about whether businesses need AI.",
        ),
    ]
    raw = [valid]
    for title, url, content in noisy_blocks:
        raw.append(f"Title: {title}\nURL: {url}\nPublished: {published}\n{content}")

    items = _parse_exa_text("\n---\n".join(raw), "profile query", now=NOW)

    assert [item.canonical_url for item in items] == [
        "https://www.linkedin.com/posts/buyer-corp_rfp-123"
    ]


def test_keyword_parser_rejects_missing_or_stale_publication_dates() -> None:
    base = (
        "Title: Buyer Corp seeks an external implementation partner\n"
        "URL: https://buyer.example/open-rfp\n"
        "Buyer Corp invites vendor proposals for an ERP implementation."
    )
    stale = base.replace("URL:", f"Published: {(NOW - timedelta(days=15)).isoformat()}\nURL:")

    assert _parse_exa_text(base, "profile query", now=NOW) == []
    assert _parse_exa_text(stale, "profile query", now=NOW) == []


def test_exa_text_adapter_preserves_provider_date_and_author(monkeypatch) -> None:
    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {
                "results": [
                    {
                        "title": "Buyer request",
                        "url": "https://buyer.example/rfp",
                        "publishedDate": "2026-09-24T10:00:00Z",
                        "author": "Buyer Corp",
                        "text": "Buyer Corp invites vendor proposals.",
                        "highlights": [],
                    }
                ]
            }

    monkeypatch.setattr("app.discovery.exa_client.httpx.post", lambda *args, **kwargs: Response())

    result = _exa_api_search("profile query")

    assert "Published: 2026-09-24T10:00:00Z" in result
    assert "Author: Buyer Corp" in result
