import hashlib
import re
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.config import Settings, get_settings
from app.crm.providers import CrmPermanentError, CrmRetryableError, HubSpotCrmProvider
from app.db import get_session
from app.discovery.connectors import FetchedSource, SourceCandidate
from app.discovery.ingestion import ingest_source
from app.extraction.service import extract_source
from app.notifications import notify_roles
from app.persistence.models import (
    AuditLog,
    Campaign,
    CampaignLead,
    ConsentRecord,
    Contact,
    ExternalMapping,
    IdempotencyRecord,
)
from app.rate_limits import enforce_rate_limit

router = APIRouter(prefix="/api/v1/integrations/hubspot", tags=["hubspot-import"])


class ContactPreview(BaseModel):
    external_id: str
    display_name: str
    company: str | None
    masked_phone: str | None
    importable: bool


class ContactPreviewPage(BaseModel):
    contacts: list[ContactPreview]
    next_after: str | None
    label: str = "Live HubSpot sandbox preview · phone values masked"


class HubSpotImportRequest(BaseModel):
    external_contact_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    campaign_id: UUID
    requirement: str = Field(min_length=5, max_length=2000)
    consent_basis: str = Field(min_length=5, max_length=500)
    consent_attested: Literal[True]


class HubSpotImportResponse(BaseModel):
    lead_id: UUID
    campaign_id: UUID
    created: bool
    outreach_eligible: bool = False
    label: str = "Imported from HubSpot; operator review required"


def _provider(settings: Settings) -> HubSpotCrmProvider:
    if not settings.hubspot_access_token:
        raise HTTPException(status_code=409, detail="HubSpot credentials are not configured")
    return HubSpotCrmProvider(
        access_token=settings.hubspot_access_token.get_secret_value(),
        api_version=settings.hubspot_api_version,
    )


def _masked_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    return f"••••{digits[-2:]}" if len(digits) >= 2 else "••••"


def _safe_external_id(value: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_-]{1,100}", value))


def _normalize_phone(phone: str | None) -> str:
    value = re.sub(r"[^\d+]", "", phone or "")
    if not re.fullmatch(r"\+[1-9]\d{7,14}", value):
        raise ValueError("The selected HubSpot contact needs a valid E.164 phone number")
    return value


@router.get("/contacts", response_model=ContactPreviewPage)
def preview_contacts(
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    after: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 25,
) -> ContactPreviewPage:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=403, detail="Editor role required")
    enforce_rate_limit(
        session, identity=f"{auth.organization_id}:{auth.user_id}", category="hubspot", limit=5
    )
    session.commit()
    provider = _provider(settings)
    try:
        page = provider.list_contacts(after=after, limit=limit)
    except CrmPermanentError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except CrmRetryableError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        provider.close()
    return ContactPreviewPage(
        contacts=[
            ContactPreview(
                external_id=item.external_id,
                display_name=item.display_name,
                company=item.company,
                masked_phone=_masked_phone(item.phone),
                importable=bool(
                    item.company and item.phone and _safe_external_id(item.external_id)
                ),
            )
            for item in page.contacts
        ],
        next_after=page.next_after,
    )


@router.post("/import", response_model=HubSpotImportResponse, status_code=201)
def import_hubspot_contact(
    payload: HubSpotImportRequest,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=200)],
) -> HubSpotImportResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=403, detail="Editor role required")
    enforce_rate_limit(
        session, identity=f"{auth.organization_id}:{auth.user_id}", category="hubspot", limit=5
    )
    campaign = session.scalar(
        select(Campaign).where(
            Campaign.id == payload.campaign_id,
            Campaign.organization_id == auth.organization_id,
            Campaign.mode == "calling_only",
        )
    )
    if campaign is None:
        raise HTTPException(status_code=404, detail="Calling-only campaign not found")
    route = "POST:/api/v1/integrations/hubspot/import"
    fingerprint = hashlib.sha256(
        f"{payload.external_contact_id}|{payload.campaign_id}|{payload.requirement}|{payload.consent_basis}".encode()
    ).hexdigest()
    existing_key = session.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.organization_id == auth.organization_id,
            IdempotencyRecord.actor_id == auth.user_id,
            IdempotencyRecord.route == route,
            IdempotencyRecord.key == idempotency_key,
        )
    )
    if existing_key:
        if existing_key.request_fingerprint != fingerprint:
            raise HTTPException(status_code=409, detail="Idempotency key was reused")
        response = existing_key.response_body or {}
        return HubSpotImportResponse(
            lead_id=UUID(str(response["lead_id"])),
            campaign_id=payload.campaign_id,
            created=False,
        )

    mapped = session.scalar(
        select(ExternalMapping).where(
            ExternalMapping.organization_id == auth.organization_id,
            ExternalMapping.provider == "hubspot",
            ExternalMapping.external_type == "contact",
            ExternalMapping.external_id == payload.external_contact_id,
        )
    )
    if mapped:
        raise HTTPException(status_code=409, detail="HubSpot contact was already imported")

    provider = _provider(settings)
    try:
        remote = provider.get_contact(payload.external_contact_id)
    except CrmPermanentError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except CrmRetryableError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        provider.close()
    if remote.external_id != payload.external_contact_id or not _safe_external_id(
        remote.external_id
    ):
        raise HTTPException(status_code=502, detail="HubSpot returned an invalid contact reference")
    if not remote.company:
        raise HTTPException(status_code=422, detail="HubSpot contact needs a company value")
    try:
        phone = _normalize_phone(remote.phone)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Keep the operator's wording as evidence while adding only the minimum
    # deterministic context needed by the bounded extractor. This does not
    # infer a requirement or consent from CRM profile data.
    content = f"{remote.company} is seeking: {payload.requirement.strip()}"
    ingestion = ingest_source(
        session,
        auth.organization_id,
        FetchedSource(
            candidate=SourceCandidate(
                external_id=f"hubspot:{remote.external_id}",
                canonical_url=f"hubspot://contact/{remote.external_id}",
                source_type="hubspot_crm",
                rights_note=(
                    "Client-controlled HubSpot sandbox contact; requirement supplied by operator."
                ),
                published_at=None,
                snapshot_ref=None,
                discovery_title=payload.requirement[:500],
                discovery_company=remote.company[:300],
                discovery_location=None,
                opportunity_type="direct_requirement",
                discovery_actionable=True,
                provider_metadata={
                    "provider": "hubspot",
                    "external_contact_id": remote.external_id,
                },
            ),
            content=content.encode(),
        ),
    )
    outcome = extract_source(
        session, organization_id=auth.organization_id, source=ingestion.document
    )
    lead = outcome.lead
    if lead is None or lead.company_id is None:
        session.rollback()
        raise HTTPException(
            status_code=422, detail="Requirement does not match the approved offering"
        )
    phone_hash = hashlib.sha256(phone.encode()).hexdigest()
    contact = session.scalar(
        select(Contact).where(
            Contact.organization_id == auth.organization_id,
            Contact.identifier_hash == phone_hash,
        )
    )
    configured_number = (
        settings.omnidim_test_to_number.get_secret_value()
        if settings.voice_transport == "omnidim" and settings.omnidim_test_to_number
        else settings.twilio_test_to_number.get_secret_value()
        if settings.twilio_test_to_number
        else None
    )
    is_test_contact = phone == configured_number
    if contact is None:
        contact = Contact(
            organization_id=auth.organization_id,
            company_id=lead.company_id,
            display_name=remote.display_name,
            channel="phone",
            identifier_encrypted_ref=(
                (
                    "env:OMNIDIM_TEST_TO_NUMBER"
                    if settings.voice_transport == "omnidim"
                    else "env:TWILIO_TEST_TO_NUMBER"
                )
                if is_test_contact
                else f"hubspot:contact:{remote.external_id}"
            ),
            identifier_hash=phone_hash,
            verification_status="verified" if is_test_contact else "crm_import_unverified",
            demo_test_contact=is_test_contact,
        )
        session.add(contact)
        session.flush()
    session.add(
        ExternalMapping(
            organization_id=auth.organization_id,
            provider="hubspot",
            local_type="contact",
            local_id=contact.id,
            external_type="contact",
            external_id=remote.external_id,
        )
    )
    consent = session.scalar(
        select(ConsentRecord).where(
            ConsentRecord.organization_id == auth.organization_id,
            ConsentRecord.contact_id == contact.id,
            ConsentRecord.channel == "browser_voice",
            ConsentRecord.status == "active",
        )
    )
    if consent is None:
        session.add(
            ConsentRecord(
                organization_id=auth.organization_id,
                contact_id=contact.id,
                channel="browser_voice",
                purpose="hackathon_demo_qualification",
                scope="operator_attested_crm_import",
                source=f"hubspot_import:{payload.consent_basis[:150]}",
                status="active",
                recorded_at=datetime.now(UTC),
                expires_at=datetime.now(UTC) + timedelta(days=1),
            )
        )
    linked = CampaignLead(
        organization_id=auth.organization_id,
        campaign_id=campaign.id,
        lead_id=lead.id,
        approved_at=None,
        approved_by=None,
        owner_id=auth.user_id,
        state="pending_review",
    )
    session.add(linked)
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="hubspot_contact_imported",
            target_type="lead",
            target_id=lead.id,
            reason="HubSpot sandbox contact; contact identifier stored as hash/reference only",
            request_id=request.state.request_id,
        )
    )
    session.add(
        IdempotencyRecord(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            route=route,
            key=idempotency_key,
            request_fingerprint=fingerprint,
            response_status=201,
            response_body={"lead_id": str(lead.id)},
            expires_at=datetime.now(UTC) + timedelta(hours=24),
        )
    )
    notify_roles(
        session,
        organization_id=auth.organization_id,
        notification_type="hubspot_import_completed",
        severity="success",
        title="HubSpot lead imported",
        summary="A sandbox CRM contact is ready for operator review.",
        action_url="/campaigns",
        dedupe_key=f"hubspot-import:{remote.external_id}",
    )
    session.commit()
    return HubSpotImportResponse(lead_id=lead.id, campaign_id=campaign.id, created=True)
