from datetime import UTC, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import get_settings
from app.conversation.script import QUALIFICATION_QUESTIONS
from app.demo_ids import (
    CAMPAIGN_ID,
    ORGANIZATION_ID,
    PRODUCT_ID,
    PRODUCT_VERSION_ID,
    USER_ID,
    WORKSPACE_ID,
)
from app.persistence.models import (
    Campaign,
    Membership,
    Organization,
    Product,
    ProductVersion,
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
            name="Futurrizon Technologies",
            active_version_id=PRODUCT_VERSION_ID,
        )
        product_version = ProductVersion(
            id=PRODUCT_VERSION_ID,
            organization_id=ORGANIZATION_ID,
            product_id=PRODUCT_ID,
            version=1,
            description=(
                "Futurrizon Technologies is a digital transformation and enterprise IT solutions company "
                "specializing in automating and digitizing business operations for international enterprise clients. "
                "Core expertise is built on the Microsoft Cloud ecosystem, delivering high-end consulting, migration, and implementation services."
            ),
            icp={
                "geographies": ["US", "UK", "Europe"],
                "industries": ["Healthcare", "Finance", "Manufacturing", "Professional Services"],
                "needs": [
                    "Legacy server migration",
                    "Microsoft 365 implementation",
                    "Custom Power Apps",
                    "Azure Cloud architecture",
                ],
            },
            exclusions=["consumer device repair", "unmanaged staffing supply"],
            facts={
                "_services": [
                    "Microsoft 365 Implementation and Governance",
                    "Power Platform Custom Business Applications",
                    "Azure Cloud Infrastructure Migration and Management",
                    "Enterprise AI Chatbot and GPT Integration",
                    "Dynamics 365 Business Central Setup",
                ],
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

        # Explicit stages make foreign-key ordering deterministic without coupling
        # persistence models through ORM relationship cascades.
        session.add(organization)
        session.flush()
        session.add_all([workspace, membership])
        session.flush()
        session.add(product)
        session.flush()
        session.add(product_version)
    return True


def main() -> None:
    inserted = seed_demo(get_settings().database_url)
    print("demo seed inserted" if inserted else "demo seed already present")


if __name__ == "__main__":
    main()
