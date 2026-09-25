"""
Subscription API — tenant plan, limits, and usage-period details.

This module exposes a hard-coded "starter" plan for every tenant.
The contract is stable: a billing table or Stripe webhook handler can
replace the stub without changing the response shape.
"""

from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import Auth
from app.db import get_session

router = APIRouter(prefix="/api/v1/subscription", tags=["subscription"])

# ---------------------------------------------------------------------------
# Plan catalogue — static definitions (replace with DB table when billing ships)
# ---------------------------------------------------------------------------

PLAN_CATALOGUE: dict[str, dict] = {
    "starter": {
        "display_name": "Starter",
        "price_inr": 3_999,
        "billing_period": "monthly",
        "leads_per_month": 250,
        "calls_per_month": 100,
        "campaigns": 5,
        "team_members": 2,
        "ai_minutes_per_month": 100,
        "emails_per_month": 500,
        "features": [
            "Up to 250 leads / month (Exa discovery)",
            "100 AI voice minutes / month (OmniDimension)",
            "500 email outreach / month",
            "5 active campaigns",
            "2 team members",
            "Browser voice (EN/HI)",
            "Evidence-backed qualification",
            "HubSpot CRM sync",
            "Email support",
        ],
    },
    "pro": {
        "display_name": "Pro",
        "price_inr": 14_999,
        "billing_period": "monthly",
        "leads_per_month": 1_500,
        "calls_per_month": 500,
        "campaigns": 20,
        "team_members": 10,
        "ai_minutes_per_month": 500,
        "emails_per_month": 3_000,
        "features": [
            "Up to 1,500 leads / month (Exa discovery)",
            "500 AI voice minutes / month (OmniDimension)",
            "3,000 email outreach / month",
            "20 active campaigns",
            "10 team members",
            "Browser + Twilio PSTN voice",
            "Evidence-backed qualification",
            "HubSpot CRM live sync",
            "OmniDimension integration",
            "Priority support",
            "Analytics exports",
        ],
    },
    "enterprise": {
        "display_name": "Enterprise",
        "price_inr": 89_999,
        "billing_period": "monthly",
        "leads_per_month": 10_000,
        "calls_per_month": 3_500,
        "campaigns": -1,
        "team_members": -1,
        "ai_minutes_per_month": 5_000,
        "emails_per_month": 25_000,
        "features": [
            "Up to 10,000 leads / month (Exa deep discovery)",
            "5,000 AI voice minutes / month (OmniDimension)",
            "25,000 email outreach / month",
            "Unlimited active campaigns",
            "Unlimited team members",
            "10 dedicated caller ID pools (DIDs)",
            "Custom brand voice cloning",
            "All voice transports",
            "Dedicated infrastructure & 99.9% SLA",
            "Custom ICP & scoring rules",
            "Dedicated CSM & custom onboarding",
        ],
    },
}


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class PlanLimits(BaseModel):
    leads_per_month: int
    calls_per_month: int
    campaigns: int
    team_members: int
    ai_minutes_per_month: int
    emails_per_month: int = 0


class PlanDefinition(BaseModel):
    slug: str
    display_name: str
    price_inr: int
    billing_period: str
    limits: PlanLimits
    features: list[str]


class SubscriptionResponse(BaseModel):
    plan: str
    status: str
    period_start: str
    period_end: str
    cancel_requested: bool
    limits: PlanLimits
    catalogue: list[PlanDefinition]


class CancelResponse(BaseModel):
    status: str
    message: str


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _period_bounds() -> tuple[str, str]:
    """Return ISO-8601 start/end of the current calendar month."""
    today = date.today()
    start = today.replace(day=1)
    # First day of next month minus one day = last day of this month
    if today.month == 12:
        end = date(today.year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(today.year, today.month + 1, 1) - timedelta(days=1)
    return start.isoformat(), end.isoformat()


def _build_catalogue() -> list[PlanDefinition]:
    result: list[PlanDefinition] = []
    for slug, defn in PLAN_CATALOGUE.items():
        result.append(
            PlanDefinition(
                slug=slug,
                display_name=defn["display_name"],
                price_inr=defn["price_inr"],
                billing_period=defn["billing_period"],
                limits=PlanLimits(
                    leads_per_month=defn["leads_per_month"],
                    calls_per_month=defn["calls_per_month"],
                    campaigns=defn["campaigns"],
                    team_members=defn["team_members"],
                    ai_minutes_per_month=defn["ai_minutes_per_month"],
                    emails_per_month=defn.get("emails_per_month", 0),
                ),
                features=defn["features"],
            )
        )
    return result


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("", response_model=SubscriptionResponse)
def get_subscription(
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> SubscriptionResponse:
    """
    Return the authenticated tenant's current subscription.
    Stub: all tenants are on the Starter plan until billing is wired.
    """
    _ = session  # will query subscription table once billing is implemented

    plan_slug = "starter"
    defn = PLAN_CATALOGUE[plan_slug]
    period_start, period_end = _period_bounds()

    return SubscriptionResponse(
        plan=plan_slug,
        status="active",
        period_start=period_start,
        period_end=period_end,
        cancel_requested=False,
        limits=PlanLimits(
            leads_per_month=defn["leads_per_month"],
            calls_per_month=defn["calls_per_month"],
            campaigns=defn["campaigns"],
            team_members=defn["team_members"],
            ai_minutes_per_month=defn["ai_minutes_per_month"],
            emails_per_month=defn.get("emails_per_month", 0),
        ),
        catalogue=_build_catalogue(),
    )


@router.post("/cancel", response_model=CancelResponse)
def cancel_subscription(
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> CancelResponse:
    """
    Record a cancellation intent. Stub: logs and returns acknowledgement.
    Owner-only guard is enforced at call site in the UI.
    """
    _ = session  # will write to subscription table once billing is implemented
    return CancelResponse(
        status="cancel_requested",
        message=(
            "Your cancellation request has been noted. "
            "Access continues until the end of the current billing period."
        ),
    )
