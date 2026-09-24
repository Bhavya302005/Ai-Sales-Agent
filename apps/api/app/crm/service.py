import re
from urllib.parse import urlparse
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.crm.providers import (
    CrmProvider,
    CrmSyncResult,
    CrmTaskPayload,
    HubSpotCrmProvider,
    MockCrmProvider,
)
from app.persistence.models import ExternalMapping, HandoffTask, Qualification

EXTERNAL_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,200}$")


def _safe_external_reference(provider_name: str, result: CrmSyncResult) -> str:
    if not EXTERNAL_ID_PATTERN.fullmatch(result.external_id):
        raise RuntimeError("CRM provider returned an invalid external identifier")
    fallback = f"{provider_name}://tasks/{result.external_id}"
    parsed = urlparse(result.external_url)
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        return fallback
    safe_internal_reference = (
        parsed.scheme == "mock"
        and parsed.netloc == "crm"
        and parsed.path.startswith("/tasks/")
    ) or (
        parsed.scheme == "hubspot"
        and parsed.netloc == "tasks"
        and parsed.path.startswith("/")
    )
    if safe_internal_reference:
        return result.external_url[:500]
    hostname = (parsed.hostname or "").casefold()
    if parsed.scheme == "https" and (
        hostname.endswith(".hubspot.com") or hostname.endswith(".hubapi.com")
    ):
        return result.external_url[:500]
    return fallback


def provider_for(settings: Settings) -> CrmProvider:
    if settings.crm_mode == "hubspot":
        if not settings.hubspot_access_token:
            raise ValueError("HubSpot credentials are not configured")
        return HubSpotCrmProvider(
            access_token=settings.hubspot_access_token.get_secret_value(),
            api_version=settings.hubspot_api_version,
        )
    return MockCrmProvider()


def _safe_body(handoff: HandoffTask, qualification: Qualification | None) -> str:
    fields = [f"Reason: {handoff.reason}"]
    if qualification:
        for label, value in (
            ("Need", qualification.need),
            ("Scope", qualification.scope),
            ("Timeline", qualification.timeline),
            ("Interest", qualification.interest),
            ("Confirmed next step", qualification.requested_next_step),
        ):
            fields.append(f"{label}: {value if value is not None else 'Unknown'}")
    fields.append("Full transcript remains in the controlled application and is not copied here.")
    return "\n".join(fields)[:5000]


def sync_handoff(
    session: Session,
    *,
    organization_id: UUID,
    handoff_id: UUID,
    settings: Settings,
    provider: CrmProvider | None = None,
) -> CrmSyncResult:
    handoff = session.scalar(
        select(HandoffTask)
        .where(
            HandoffTask.id == handoff_id,
            HandoffTask.organization_id == organization_id,
        )
        .with_for_update()
    )
    if handoff is None:
        raise LookupError("handoff not found")
    adapter = provider or provider_for(settings)
    existing = session.scalar(
        select(ExternalMapping).where(
            ExternalMapping.organization_id == organization_id,
            ExternalMapping.provider == adapter.name,
            ExternalMapping.local_type == "handoff_task",
            ExternalMapping.local_id == handoff.id,
        )
    )
    if existing:
        verified = adapter.verify_task(existing.external_id)
        if not verified:
            raise RuntimeError("stored CRM mapping could not be verified")
        return CrmSyncResult(
            external_id=existing.external_id,
            external_url=handoff.external_reference or f"{adapter.name}://tasks/{existing.external_id}",
            verified=True,
        )
    qualification = session.scalar(
        select(Qualification).where(
            Qualification.organization_id == organization_id,
            Qualification.call_id == handoff.call_id,
        )
    )
    result = adapter.sync_task(
        CrmTaskPayload(
            local_id=handoff.id,
            subject=f"AI sales follow-up · {handoff.priority} priority",
            body=_safe_body(handoff, qualification),
            due_at=handoff.due_at,
            priority=handoff.priority,
        )
    )
    if not result.verified:
        raise RuntimeError("CRM provider did not verify the external task")
    safe_reference = _safe_external_reference(adapter.name, result)
    session.add(
        ExternalMapping(
            organization_id=organization_id,
            provider=adapter.name,
            local_type="handoff_task",
            local_id=handoff.id,
            external_type="task",
            external_id=result.external_id,
        )
    )
    handoff.external_reference = safe_reference
    session.flush()
    return CrmSyncResult(
        external_id=result.external_id,
        external_url=safe_reference,
        verified=True,
    )
