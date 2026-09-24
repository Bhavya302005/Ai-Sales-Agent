from datetime import UTC, datetime
from decimal import Decimal
from hashlib import sha256

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import get_settings
from app.conversation.script import QUALIFICATION_QUESTIONS
from app.demo_ids import (
    ASSERTION_ID,
    CAMPAIGN_ID,
    CAMPAIGN_LEAD_ID,
    COMPANY_ID,
    CONSENT_ID,
    CONTACT_ID,
    LEAD_ID,
    ORGANIZATION_ID,
    PRODUCT_ID,
    PRODUCT_VERSION_ID,
    REQUIREMENT_ID,
    SCORE_ID,
    SOURCE_ID,
    USER_ID,
    WORKSPACE_ID,
)
from app.persistence.models import (
    Campaign,
    CampaignLead,
    Company,
    ConsentRecord,
    Contact,
    FieldAssertion,
    Lead,
    Membership,
    Organization,
    Product,
    ProductVersion,
    Requirement,
    ScoreSnapshot,
    SourceDocument,
    UsageEvent,
    Workspace,
)

OBSERVED_AT = datetime(2026, 9, 16, 9, 0, tzinfo=UTC)
EVIDENCE = (
    "Sapphire Legal & Advisory is seeking an implementation partner for a SharePoint Online "
    "document-management and employee-intranet rollout. The project includes migrating legacy "
    "file shares, permission design, retention controls, search, and Microsoft Teams integration. "
    "Proposals are requested by 30 September 2026."
)


def seed_demo(database_url: str) -> bool:
    """Insert the fixed, synthetic demo graph once. Return True when inserted."""
    engine = create_engine(database_url)
    with Session(engine) as session, session.begin():
        if session.get(Organization, ORGANIZATION_ID) is not None:
            existing_campaign = session.get(Campaign, CAMPAIGN_ID)
            if existing_campaign is not None:
                existing_campaign.max_attempts = 3
            return False

        organization = Organization(id=ORGANIZATION_ID, name="Aster Cloud Works")
        workspace = Workspace(
            id=WORKSPACE_ID,
            organization_id=ORGANIZATION_ID,
            name="SignalPath Sales Workspace",
            locale="en-IN",
            timezone="Asia/Kolkata",
        )
        membership = Membership(
            id=USER_ID,
            organization_id=ORGANIZATION_ID,
            user_id=USER_ID,
            role="owner",
            status="active",
        )
        product = Product(
            id=PRODUCT_ID,
            organization_id=ORGANIZATION_ID,
            workspace_id=WORKSPACE_ID,
            name="Microsoft 365 and SharePoint Modernization",
            active_version_id=PRODUCT_VERSION_ID,
        )
        product_version = ProductVersion(
            id=PRODUCT_VERSION_ID,
            organization_id=ORGANIZATION_ID,
            product_id=PRODUCT_ID,
            version=1,
            description=(
                "SharePoint Online document management, intranet, migration, governance, and "
                "Microsoft 365 integration for mid-market Indian organizations."
            ),
            icp={
                "geographies": ["India"],
                "industries": ["legal services", "professional services", "manufacturing"],
                "needs": [
                    "SharePoint implementation",
                    "document management",
                    "intranet modernization",
                    "Microsoft 365 migration",
                ],
            },
            exclusions=["consumer device repair", "unmanaged staffing supply"],
            facts={
                "delivery": (
                    "Discovery, information architecture, migration planning, implementation, "
                    "training, and handover are supported."
                ),
                "deployment": (
                    "SharePoint Online and supported Microsoft 365 integration patterns are "
                    "assessed during discovery."
                ),
                "security": (
                    "Permissions, retention, compliance, and security requirements are reviewed "
                    "by a human solution architect."
                ),
                "timeline": "A delivery timeline is proposed only after scope discovery.",
                "support": (
                    "Post-implementation support options can be included in a custom proposal."
                ),
                "_qualification_questions": list(QUALIFICATION_QUESTIONS),
                "_handoff_conditions": [
                    "The lead confirms an active SharePoint or document-modernization project.",
                    "The lead asks for pricing, architecture, or a delivery commitment.",
                    "The lead requests a meeting with a human specialist.",
                ],
            },
            pricing_policy="Custom quote required. The agent cannot state a price or discount.",
            approved_at=OBSERVED_AT,
            approved_by=USER_ID,
        )
        source = SourceDocument(
            id=SOURCE_ID,
            organization_id=ORGANIZATION_ID,
            workspace_id=WORKSPACE_ID,
            canonical_url="fixture://permitted/sapphire-sharepoint-modernization-2026",
            source_type="permitted_fixture",
            rights_note="Synthetic fixture authored for this demo; safe to store and display.",
            fetched_at=OBSERVED_AT,
            published_at=datetime(2026, 9, 15, 6, 30, tzinfo=UTC),
            observed_at=OBSERVED_AT,
            content_hash=sha256(EVIDENCE.encode()).hexdigest(),
            snapshot_ref="tests/fixtures/permitted_requirement.txt",
            evidence_excerpt=EVIDENCE,
            extraction_status="completed",
        )
        requirement = Requirement(
            id=REQUIREMENT_ID,
            organization_id=ORGANIZATION_ID,
            source_document_id=SOURCE_ID,
            normalized_need=(
                "Implement SharePoint Online document management and an employee intranet, "
                "including legacy file-share migration and Microsoft Teams integration."
            ),
            category="sharepoint_implementation",
            geography="Mumbai, India",
            urgency="proposal_deadline_explicit",
            explicit_deadline=datetime(2026, 9, 30, 18, 0, tzinfo=UTC),
            evidence_span={"excerpt": EVIDENCE, "start": 0, "end": len(EVIDENCE)},
        )
        company = Company(
            id=COMPANY_ID,
            organization_id=ORGANIZATION_ID,
            normalized_name="Sapphire Legal & Advisory",
            normalized_domain=None,
            location="Gujarat, India",
            merge_status="canonical",
        )
        contact = Contact(
            id=CONTACT_ID,
            organization_id=ORGANIZATION_ID,
            company_id=COMPANY_ID,
            display_name="Consenting demo participant",
            channel="browser_voice",
            identifier_encrypted_ref=None,
            identifier_hash=sha256(b"consenting-demo-participant").hexdigest(),
            verification_status="test_participant_verified",
            demo_test_contact=True,
        )
        lead = Lead(
            id=LEAD_ID,
            organization_id=ORGANIZATION_ID,
            workspace_id=WORKSPACE_ID,
            requirement_id=REQUIREMENT_ID,
            company_id=COMPANY_ID,
            product_version_id=PRODUCT_VERSION_ID,
            lifecycle="reviewed",
            outreach_eligible=False,
        )
        assertion = FieldAssertion(
            id=ASSERTION_ID,
            organization_id=ORGANIZATION_ID,
            entity_type="requirement",
            entity_id=REQUIREMENT_ID,
            field_name="normalized_need",
            value={"text": requirement.normalized_need},
            source_document_id=SOURCE_ID,
            evidence_span=requirement.evidence_span,
            extraction_method="deterministic_fixture_v1",
            confidence=Decimal("1.0000"),
            observed_at=OBSERVED_AT,
            status="verified",
        )
        score = ScoreSnapshot(
            id=SCORE_ID,
            organization_id=ORGANIZATION_ID,
            lead_id=LEAD_ID,
            feature_values={
                "icp_fit": 0.9,
                "explicit_intent": 1.0,
                "urgency": 0.8,
                "source_quality": 1.0,
                "data_confidence": 0.9,
                "engagement": 0.0,
                "freshness": 1.0,
            },
            weights={
                "icp_fit": 0.25,
                "explicit_intent": 0.25,
                "urgency": 0.10,
                "source_quality": 0.10,
                "data_confidence": 0.10,
                "engagement": 0.10,
                "freshness": 0.10,
            },
            evidence={"explicit_intent": [str(ASSERTION_ID)]},
            score=85,
            confidence=Decimal("0.9000"),
            explanation=(
                "Explicit SharePoint implementation need and deadline fit the approved offering; "
                "engagement is unknown."
            ),
            rule_version="score.v1",
        )
        campaign = Campaign(
            id=CAMPAIGN_ID,
            organization_id=ORGANIZATION_ID,
            workspace_id=WORKSPACE_ID,
            name="Qualified opportunity outreach",
            timezone="Asia/Kolkata",
            daily_budget_inr=Decimal("500.00"),
            status="active",
            max_attempts=3,
        )
        campaign_lead = CampaignLead(
            id=CAMPAIGN_LEAD_ID,
            organization_id=ORGANIZATION_ID,
            campaign_id=CAMPAIGN_ID,
            lead_id=LEAD_ID,
            approved_at=None,
            approved_by=None,
            owner_id=USER_ID,
            state="pending_review",
        )
        consent = ConsentRecord(
            id=CONSENT_ID,
            organization_id=ORGANIZATION_ID,
            contact_id=CONTACT_ID,
            channel="browser_voice",
            purpose="hackathon_demo_qualification",
            scope="single_browser_session",
            source="explicit_test_participant_agreement",
            status="active",
            recorded_at=OBSERVED_AT,
            expires_at=datetime(2026, 12, 31, 18, 30, tzinfo=UTC),
        )
        discovery_usage = UsageEvent(
            organization_id=ORGANIZATION_ID,
            provider_event_id=f"{SOURCE_ID}:enrichment",
            provider="permitted_fixture",
            quantity=Decimal("1"),
            unit="enrichment_units",
            estimated_cost_inr=Decimal("0"),
            actual_cost_inr=None,
            occurred_at=OBSERVED_AT,
        )
        # Explicit stages make foreign-key ordering deterministic without coupling
        # persistence models through ORM relationship cascades.
        session.add(organization)
        session.flush()
        session.add_all([workspace, membership, company])
        session.flush()
        session.add_all([product, source, contact, campaign])
        session.flush()
        session.add_all([product_version, requirement])
        session.flush()
        session.add(lead)
        session.flush()
        session.add_all([assertion, score, campaign_lead, consent, discovery_usage])
    return True


def main() -> None:
    inserted = seed_demo(get_settings().database_url)
    print("demo seed inserted" if inserted else "demo seed already present")


if __name__ == "__main__":
    main()
