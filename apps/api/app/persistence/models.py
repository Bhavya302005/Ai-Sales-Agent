from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column

JSON_VALUE = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSON_VALUE, list[Any]: JSON_VALUE}


class IdMixin:
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class TenantMixin:
    @declared_attr
    def organization_id(cls) -> Mapped[UUID]:
        return mapped_column(
            Uuid,
            ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        )


class Organization(IdMixin, TimestampMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200), nullable=False)


class Workspace(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "workspaces"
    __table_args__ = (UniqueConstraint("organization_id", "name"),)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    locale: Mapped[str] = mapped_column(String(20), nullable=False, default="en-IN")
    timezone: Mapped[str] = mapped_column(String(80), nullable=False, default="Asia/Kolkata")


class Membership(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id"),
        CheckConstraint("role IN ('owner', 'operator', 'viewer')", name="membership_role"),
    )

    user_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")


class Product(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("organization_id", "workspace_id", "name"),)

    workspace_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    active_version_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)


class ProductVersion(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "product_versions"
    __table_args__ = (UniqueConstraint("organization_id", "product_id", "version"),)

    product_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    icp: Mapped[dict[str, Any]] = mapped_column(JSON_VALUE, nullable=False)
    exclusions: Mapped[list[Any]] = mapped_column(JSON_VALUE, nullable=False)
    facts: Mapped[dict[str, Any]] = mapped_column(JSON_VALUE, nullable=False)
    pricing_policy: Mapped[str] = mapped_column(Text, nullable=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[UUID | None] = mapped_column(Uuid)


class SourceDocument(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "source_documents"
    __table_args__ = (
        UniqueConstraint("organization_id", "canonical_url"),
        UniqueConstraint("organization_id", "content_hash"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    canonical_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    rights_note: Mapped[str] = mapped_column(Text, nullable=False)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    snapshot_ref: Mapped[str | None] = mapped_column(String(500))
    evidence_excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    extraction_status: Mapped[str] = mapped_column(String(40), nullable=False)
    discovery_title: Mapped[str | None] = mapped_column(String(500))
    discovery_company: Mapped[str | None] = mapped_column(String(300))
    discovery_location: Mapped[str | None] = mapped_column(String(300))
    opportunity_type: Mapped[str | None] = mapped_column(String(40))
    discovery_actionable: Mapped[bool | None] = mapped_column(Boolean)
    provider_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSON_VALUE, nullable=False, default=dict
    )


class Requirement(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "requirements"

    source_document_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("source_documents.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    normalized_need: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))
    geography: Mapped[str | None] = mapped_column(String(200))
    urgency: Mapped[str | None] = mapped_column(String(40))
    explicit_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    evidence_span: Mapped[dict[str, Any]] = mapped_column(JSON_VALUE, nullable=False)


class Company(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "companies"
    __table_args__ = (
        UniqueConstraint("organization_id", "normalized_domain"),
        Index("ix_companies_identity", "organization_id", "normalized_name", "location"),
    )

    normalized_name: Mapped[str] = mapped_column(String(300), nullable=False)
    normalized_domain: Mapped[str | None] = mapped_column(String(253))
    location: Mapped[str | None] = mapped_column(String(300))
    merge_status: Mapped[str] = mapped_column(String(30), nullable=False, default="canonical")
    merged_into_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("companies.id", ondelete="RESTRICT")
    )


class Contact(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "contacts"
    __table_args__ = (UniqueConstraint("organization_id", "identifier_hash"),)

    company_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("companies.id", ondelete="SET NULL"), index=True
    )
    display_name: Mapped[str | None] = mapped_column(String(200))
    channel: Mapped[str] = mapped_column(String(30), nullable=False)
    identifier_encrypted_ref: Mapped[str | None] = mapped_column(String(500))
    identifier_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    verification_status: Mapped[str] = mapped_column(String(30), nullable=False)
    demo_test_contact: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Lead(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "leads"
    __table_args__ = (
        UniqueConstraint("organization_id", "requirement_id", "product_version_id"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    requirement_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("requirements.id", ondelete="RESTRICT"), nullable=False
    )
    company_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("companies.id", ondelete="SET NULL")
    )
    product_version_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("product_versions.id", ondelete="RESTRICT"), nullable=False
    )
    lifecycle: Mapped[str] = mapped_column(String(40), nullable=False, default="discovered")
    outreach_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class FieldAssertion(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "field_assertions"
    __table_args__ = (
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="assertion_confidence"),
        CheckConstraint(
            "status IN ('verified', 'corroborated', 'single_source', 'inferred', "
            "'unknown', 'conflicted', 'expired')",
            name="assertion_status",
        ),
        Index(
            "ix_assertions_entity_field",
            "organization_id",
            "entity_type",
            "entity_id",
            "field_name",
        ),
    )

    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[dict[str, Any] | None] = mapped_column(JSON_VALUE)
    source_document_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("source_documents.id", ondelete="RESTRICT")
    )
    evidence_span: Mapped[dict[str, Any] | None] = mapped_column(JSON_VALUE)
    extraction_method: Mapped[str] = mapped_column(String(80), nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)


class ScoreSnapshot(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "score_snapshots"
    __table_args__ = (CheckConstraint("score >= 0 AND score <= 100", name="score_range"),)

    lead_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    feature_values: Mapped[dict[str, Any]] = mapped_column(JSON_VALUE, nullable=False)
    weights: Mapped[dict[str, Any]] = mapped_column(JSON_VALUE, nullable=False)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON_VALUE, nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    rule_version: Mapped[str] = mapped_column(String(50), nullable=False)


class Campaign(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "campaigns"

    workspace_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    timezone: Mapped[str] = mapped_column(String(80), nullable=False)
    daily_budget_inr: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    mode: Mapped[str] = mapped_column(String(30), nullable=False, default="leads_and_calling")
    scheduled_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recurrence: Mapped[str] = mapped_column(String(20), nullable=False, default="once")
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class CampaignLead(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "campaign_leads"
    __table_args__ = (UniqueConstraint("organization_id", "campaign_id", "lead_id"),)

    campaign_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False
    )
    lead_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[UUID | None] = mapped_column(Uuid)
    owner_id: Mapped[UUID | None] = mapped_column(Uuid)
    state: Mapped[str] = mapped_column(String(30), nullable=False)


class ConsentRecord(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "consent_records"

    contact_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("contacts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    channel: Mapped[str] = mapped_column(String(30), nullable=False)
    purpose: Mapped[str] = mapped_column(String(100), nullable=False)
    scope: Mapped[str] = mapped_column(String(200), nullable=False)
    source: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Suppression(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "suppressions"
    __table_args__ = (UniqueConstraint("organization_id", "channel", "identifier_hash", "scope"),)

    channel: Mapped[str] = mapped_column(String(30), nullable=False)
    identifier_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    reason: Mapped[str] = mapped_column(String(200), nullable=False)
    scope: Mapped[str] = mapped_column(String(100), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Call(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "calls"
    __table_args__ = (
        UniqueConstraint("attempt_id"),
        CheckConstraint(
            "state IN ('requested', 'eligible', 'connecting', 'active', 'ending', "
            "'completed', 'failed', 'blocked')",
            name="call_state",
        ),
    )

    lead_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("leads.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    campaign_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("campaigns.id", ondelete="SET NULL"), index=True
    )
    contact_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("contacts.id", ondelete="RESTRICT"), nullable=False
    )
    attempt_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    transport: Mapped[str] = mapped_column(String(30), nullable=False)
    state: Mapped[str] = mapped_column(String(30), nullable=False)
    eligibility_decision: Mapped[dict[str, Any]] = mapped_column(JSON_VALUE, nullable=False)
    max_duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    usage: Mapped[dict[str, Any]] = mapped_column(JSON_VALUE, nullable=False, default=dict)
    outcome: Mapped[str | None] = mapped_column(String(100))


class TranscriptSegment(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "transcript_segments"
    __table_args__ = (UniqueConstraint("organization_id", "call_id", "sequence"),)

    call_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("calls.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    speaker: Mapped[str] = mapped_column(String(30), nullable=False)
    started_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    ended_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(20), nullable=False)
    is_final: Mapped[bool] = mapped_column(Boolean, nullable=False)


class Qualification(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "qualifications"
    __table_args__ = (UniqueConstraint("organization_id", "call_id"),)

    call_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("calls.id", ondelete="CASCADE"), nullable=False
    )
    need: Mapped[str | None] = mapped_column(Text)
    timeline: Mapped[str | None] = mapped_column(Text)
    scope: Mapped[str | None] = mapped_column(Text)
    authority_known: Mapped[bool | None] = mapped_column(Boolean)
    budget_known: Mapped[bool | None] = mapped_column(Boolean)
    objections: Mapped[list[Any]] = mapped_column(JSON_VALUE, nullable=False, default=list)
    interest: Mapped[str | None] = mapped_column(String(100))
    requested_next_step: Mapped[str | None] = mapped_column(Text)
    evidence_segment_ids: Mapped[list[Any]] = mapped_column(
        JSON_VALUE, nullable=False, default=list
    )


class HandoffTask(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "handoff_tasks"
    __table_args__ = (UniqueConstraint("organization_id", "call_id"),)

    lead_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("leads.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    call_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("calls.id", ondelete="SET NULL"))
    owner_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    priority: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    state: Mapped[str] = mapped_column(String(30), nullable=False)
    external_reference: Mapped[str | None] = mapped_column(String(500))


class IntegrationAccount(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "integration_accounts"
    __table_args__ = (UniqueConstraint("organization_id", "provider"),)

    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    encrypted_credential_ref: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(30), nullable=False)


class OutboxEvent(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "outbox_events"
    __table_args__ = (UniqueConstraint("event_id"),)

    event_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    aggregate_type: Mapped[str] = mapped_column(String(64), nullable=False)
    aggregate_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    payload_ref: Mapped[str] = mapped_column(String(500), nullable=False)
    correlation_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    causation_id: Mapped[UUID | None] = mapped_column(Uuid)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    last_error_code: Mapped[str | None] = mapped_column(String(100))


class UsageEvent(IdMixin, TenantMixin, Base):
    __tablename__ = "usage_events"
    __table_args__ = (UniqueConstraint("provider", "provider_event_id"),)

    provider_event_id: Mapped[str] = mapped_column(String(200), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(16, 4), nullable=False)
    unit: Mapped[str] = mapped_column(String(30), nullable=False)
    estimated_cost_inr: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    actual_cost_inr: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AuditLog(IdMixin, TenantMixin, Base):
    __tablename__ = "audit_logs"

    actor_id: Mapped[UUID | None] = mapped_column(Uuid)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    request_id: Mapped[str] = mapped_column(String(100), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class IdempotencyRecord(IdMixin, TenantMixin, Base):
    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("organization_id", "actor_id", "route", "key"),)

    actor_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    route: Mapped[str] = mapped_column(String(200), nullable=False)
    key: Mapped[str] = mapped_column(String(200), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    response_status: Mapped[int | None] = mapped_column(Integer)
    response_body: Mapped[dict[str, Any] | None] = mapped_column(JSON_VALUE)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ExternalMapping(IdMixin, TenantMixin, TimestampMixin, Base):
    __tablename__ = "external_mappings"
    __table_args__ = (
        UniqueConstraint("organization_id", "provider", "local_type", "local_id"),
        UniqueConstraint("organization_id", "provider", "external_type", "external_id"),
    )

    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    local_type: Mapped[str] = mapped_column(String(64), nullable=False)
    local_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    external_type: Mapped[str] = mapped_column(String(64), nullable=False)
    external_id: Mapped[str] = mapped_column(String(200), nullable=False)


class ProviderWebhookEvent(IdMixin, TenantMixin, Base):
    __tablename__ = "provider_webhook_events"
    __table_args__ = (UniqueConstraint("provider", "provider_event_id"),)

    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_event_id: Mapped[str] = mapped_column(String(200), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), nullable=False)


class ModelRun(IdMixin, TenantMixin, Base):
    __tablename__ = "model_runs"

    purpose: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(50), nullable=False)
    schema_version: Mapped[str] = mapped_column(String(50), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    result_status: Mapped[str] = mapped_column(String(30), nullable=False)
    response_hash: Mapped[str | None] = mapped_column(String(64))
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
