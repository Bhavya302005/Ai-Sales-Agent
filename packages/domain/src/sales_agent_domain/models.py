from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated
from uuid import UUID

from pydantic import Field, JsonValue, model_validator

from sales_agent_domain.base import DomainModel, TimestampedModel

Confidence = Annotated[float, Field(ge=0, le=1)]
Score = Annotated[int, Field(ge=0, le=100)]


class AssertionStatus(StrEnum):
    VERIFIED = "verified"
    CORROBORATED = "corroborated"
    SINGLE_SOURCE = "single_source"
    INFERRED = "inferred"
    UNKNOWN = "unknown"
    CONFLICTED = "conflicted"
    EXPIRED = "expired"


class CallState(StrEnum):
    REQUESTED = "requested"
    ELIGIBLE = "eligible"
    CONNECTING = "connecting"
    ACTIVE = "active"
    ENDING = "ending"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"


class IntegrationState(StrEnum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    RETRYING = "retrying"
    ACTION_REQUIRED = "action_required"


class EvidenceRef(DomainModel):
    source_document_id: UUID
    excerpt: str = Field(min_length=1, max_length=2_000)
    start_offset: int | None = Field(default=None, ge=0)
    end_offset: int | None = Field(default=None, ge=0)
    confidence: Confidence

    @model_validator(mode="after")
    def offsets_are_consistent(self) -> "EvidenceRef":
        if (self.start_offset is None) != (self.end_offset is None):
            raise ValueError("evidence offsets must be supplied together")
        if (
            self.start_offset is not None
            and self.end_offset is not None
            and self.end_offset <= self.start_offset
        ):
            raise ValueError("evidence end_offset must exceed start_offset")
        return self


class ProductVersion(TimestampedModel):
    id: UUID
    organization_id: UUID
    workspace_id: UUID
    product_id: UUID
    version: int = Field(ge=1)
    description: str = Field(min_length=1)
    icp: dict[str, JsonValue]
    exclusions: tuple[str, ...]
    facts: dict[str, JsonValue]
    pricing_policy: str = Field(min_length=1)
    approved_at: datetime | None = None


class SourceDocument(TimestampedModel):
    id: UUID
    organization_id: UUID
    workspace_id: UUID
    canonical_url: str = Field(min_length=1, max_length=2_048)
    source_type: str = Field(min_length=1, max_length=64)
    rights_note: str = Field(min_length=1, max_length=1_000)
    content_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    observed_at: datetime
    published_at: datetime | None = None
    extraction_status: str


class Requirement(TimestampedModel):
    id: UUID
    organization_id: UUID
    workspace_id: UUID
    source_document_id: UUID
    normalized_need: str = Field(min_length=1)
    category: str | None = None
    geography: str | None = None
    urgency: str | None = None
    explicit_deadline: datetime | None = None
    evidence: tuple[EvidenceRef, ...] = Field(min_length=1)


class FieldAssertion(TimestampedModel):
    id: UUID
    organization_id: UUID
    entity_type: str
    entity_id: UUID
    field_name: str
    value: JsonValue | None
    source_document_id: UUID | None
    evidence: EvidenceRef | None
    extraction_method: str
    confidence: Confidence
    observed_at: datetime
    status: AssertionStatus

    @model_validator(mode="after")
    def known_values_require_evidence(self) -> "FieldAssertion":
        if self.status == AssertionStatus.UNKNOWN:
            if self.value is not None:
                raise ValueError("unknown assertions cannot contain a value")
        elif self.value is not None and (self.source_document_id is None or self.evidence is None):
            raise ValueError("populated assertions require source evidence")
        return self


class Lead(TimestampedModel):
    id: UUID
    organization_id: UUID
    workspace_id: UUID
    requirement_id: UUID
    company_id: UUID | None = None
    product_version_id: UUID
    lifecycle: str
    outreach_eligible: bool = False


class ScoreSnapshot(TimestampedModel):
    id: UUID
    organization_id: UUID
    lead_id: UUID
    features: dict[str, Confidence]
    weights: dict[str, Confidence]
    evidence: dict[str, tuple[UUID, ...]]
    score: Score
    confidence: Confidence
    explanation: str
    rule_version: str


class Call(TimestampedModel):
    id: UUID
    organization_id: UUID
    lead_id: UUID
    attempt_id: UUID
    transport: str
    state: CallState
    eligibility_decision: str
    max_duration_seconds: int = Field(ge=30, le=900)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    outcome: str | None = None


class Qualification(TimestampedModel):
    id: UUID
    organization_id: UUID
    call_id: UUID
    need: str | None = None
    timeline: str | None = None
    scope: str | None = None
    authority_known: bool | None = None
    budget_known: bool | None = None
    objections: tuple[str, ...] = ()
    interest: str | None = None
    requested_next_step: str | None = None
    evidence_segment_ids: tuple[UUID, ...] = ()


class HandoffTask(TimestampedModel):
    id: UUID
    organization_id: UUID
    lead_id: UUID
    call_id: UUID | None = None
    owner_id: UUID
    priority: str
    reason: str
    due_at: datetime
    state: str
    integration_state: IntegrationState = IntegrationState.PENDING
    external_reference: str | None = None


class UsageEvent(DomainModel):
    id: UUID
    organization_id: UUID
    provider_event_id: str
    provider: str
    quantity: Decimal = Field(ge=0)
    unit: str
    estimated_cost_inr: Decimal = Field(ge=0)
    actual_cost_inr: Decimal | None = Field(default=None, ge=0)
    occurred_at: datetime

