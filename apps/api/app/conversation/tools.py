from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.persistence.models import Call, Contact, Lead, Product, ProductVersion, Suppression
from app.voice_sessions import VoiceCallContext

type ConversationStateName = Literal[
    "EligibilityChecked",
    "Disclosure",
    "Permission",
    "Qualification",
    "FAQ",
    "NextStep",
    "Handoff",
    "OptOut",
    "Completed",
    "Ended",
    "Blocked",
]


class _ToolRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class LeadLookup(_ToolRequest):
    tool: Literal["lead_lookup"] = "lead_lookup"


class ProductSearch(_ToolRequest):
    tool: Literal["product_search"] = "product_search"
    query: str = Field(min_length=2, max_length=100)


class AvailabilityLookup(_ToolRequest):
    tool: Literal["availability_lookup"] = "availability_lookup"
    topic: str = Field(min_length=2, max_length=200)


class CallbackSchedule(_ToolRequest):
    tool: Literal["callback_schedule"] = "callback_schedule"
    proposed_time: str = Field(min_length=2, max_length=100)
    contact_details: str = Field(min_length=2, max_length=100)
    confirmed: bool


class LeadUpdate(_ToolRequest):
    tool: Literal["lead_update"] = "lead_update"
    field: Literal[
        "need",
        "timeline",
        "scope",
        "authority_known",
        "budget_known",
        "interest",
        "requested_next_step",
    ]
    value: str | bool = Field()


class HumanHandoff(_ToolRequest):
    tool: Literal["human_handoff"] = "human_handoff"
    reason: str = Field(min_length=2, max_length=500)


class OptOut(_ToolRequest):
    tool: Literal["opt_out"] = "opt_out"
    reason: Literal["participant_opt_out", "wrong_person"]


type SafeToolRequest = (
    LeadLookup
    | ProductSearch
    | AvailabilityLookup
    | CallbackSchedule
    | LeadUpdate
    | HumanHandoff
    | OptOut
)

TOOL_STATE_ALLOWLIST: dict[str, frozenset[str]] = {
    "lead_lookup": frozenset({"Qualification"}),
    "product_search": frozenset({"FAQ"}),
    "availability_lookup": frozenset({"FAQ", "NextStep"}),
    "callback_schedule": frozenset({"NextStep"}),
    "lead_update": frozenset({"Qualification"}),
    "human_handoff": frozenset({"Qualification", "FAQ", "NextStep"}),
    "opt_out": frozenset({"Permission", "Qualification", "FAQ", "NextStep"}),
}


class ToolAuthorizationError(ValueError):
    """Raised when a bounded dialogue requests a tool outside server policy."""


def execute_safe_tool(
    session: Session,
    *,
    context: VoiceCallContext,
    state: ConversationStateName,
    request: SafeToolRequest,
) -> dict[str, Any]:
    if state not in TOOL_STATE_ALLOWLIST[request.tool]:
        raise ToolAuthorizationError(f"{request.tool} is not allowed in state {state}")
    call = session.scalar(
        select(Call).where(
            Call.id == context.call_id,
            Call.organization_id == context.organization_id,
        )
    )
    if call is None or call.state != "active":
        raise ToolAuthorizationError("tools require an active tenant-scoped call")

    if isinstance(request, LeadLookup):
        lead = session.scalar(
            select(Lead).where(
                Lead.id == call.lead_id,
                Lead.organization_id == context.organization_id,
            )
        )
        if lead is None:
            raise ToolAuthorizationError("lead is unavailable")
        return {"lead_id": str(lead.id), "lifecycle": lead.lifecycle}

    if isinstance(request, ProductSearch):
        lead = session.scalar(
            select(Lead).where(
                Lead.id == call.lead_id,
                Lead.organization_id == context.organization_id,
            )
        )
        version = (
            session.scalar(
                select(ProductVersion)
                .join(
                    Product,
                    (Product.id == ProductVersion.product_id)
                    & (Product.organization_id == context.organization_id),
                )
                .where(
                    ProductVersion.id == lead.product_version_id,
                    ProductVersion.organization_id == context.organization_id,
                    ProductVersion.approved_at.is_not(None),
                    Product.active_version_id == ProductVersion.id,
                )
            )
            if lead
            else None
        )
        if version is None:
            raise ToolAuthorizationError("approved product knowledge is unavailable")
        terms = request.query.casefold().split()
        matches = {
            key: str(value)
            for key, value in version.facts.items()
            if not key.startswith("_")
            and any(term in f"{key} {value}".casefold() for term in terms)
        }
        return {"matches": matches, "product_version_id": str(version.id)}

    if isinstance(request, AvailabilityLookup):
        return {
            "available": None,
            "reason": "Live specialist availability is not connected in this MVP.",
        }

    if isinstance(request, CallbackSchedule):
        if not request.confirmed:
            raise ToolAuthorizationError("callback requires explicit participant confirmation")
        return {
            "status": "proposed",
            "proposed_time": request.proposed_time,
            "contact_details": request.contact_details,
            "calendar_booking": False,
        }

    if isinstance(request, LeadUpdate):
        return {"status": "captured_in_session", "field": request.field}

    if isinstance(request, HumanHandoff):
        return {"status": "handoff_required", "reason": request.reason, "persisted": False}

    contact = session.scalar(
        select(Contact).where(
            Contact.id == call.contact_id,
            Contact.organization_id == context.organization_id,
        )
    )
    if contact is None:
        raise ToolAuthorizationError("contact is unavailable")
    suppression_channel = "pstn_voice" if context.transport == "twilio" else "browser_voice"
    existing = session.scalar(
        select(Suppression).where(
            Suppression.organization_id == context.organization_id,
            Suppression.identifier_hash == contact.identifier_hash,
            Suppression.channel == suppression_channel,
            Suppression.scope == "all_campaigns",
            or_(
                Suppression.expires_at.is_(None),
                Suppression.expires_at > context.started_at,
            ),
        )
    )
    if existing is None:
        session.add(
            Suppression(
                organization_id=context.organization_id,
                channel=suppression_channel,
                identifier_hash=contact.identifier_hash,
                reason=request.reason,
                scope="all_campaigns",
                expires_at=None,
            )
        )
        session.commit()
    return {"status": "suppressed", "reason": request.reason}
