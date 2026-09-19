from datetime import datetime
from enum import StrEnum
from typing import Self
from uuid import UUID

from pydantic import Field, model_validator

from sales_agent_domain.base import DomainModel


class DomainEventType(StrEnum):
    SOURCE_INGESTED = "source.ingested.v1"
    LEAD_EXTRACTION_REQUESTED = "lead.extraction_requested.v1"
    LEAD_EXTRACTED = "lead.extracted.v1"
    LEAD_SCORING_REQUESTED = "lead.scoring_requested.v1"
    LEAD_SCORED = "lead.scored.v1"
    LEAD_APPROVED = "lead.approved.v1"
    CALL_REQUESTED = "call.requested.v1"
    CALL_STARTED = "call.started.v1"
    CALL_COMPLETED = "call.completed.v1"
    QUALIFICATION_COMPLETED = "qualification.completed.v1"
    HANDOFF_CREATED = "handoff.created.v1"
    CRM_SYNC_REQUESTED = "crm.sync_requested.v1"
    CRM_SYNC_SUCCEEDED = "crm.sync_succeeded.v1"
    CRM_SYNC_FAILED = "crm.sync_failed.v1"
    USAGE_RECORDED = "usage.recorded.v1"


class EventEnvelope(DomainModel):
    event_id: UUID
    event_type: DomainEventType
    organization_id: UUID
    aggregate_type: str = Field(min_length=1, max_length=64)
    aggregate_id: UUID
    occurred_at: datetime
    correlation_id: UUID
    causation_id: UUID | None = None
    schema_version: int = Field(default=1, ge=1)
    payload_ref: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def timestamp_is_aware(self) -> Self:
        if self.occurred_at.tzinfo is None or self.occurred_at.utcoffset() is None:
            raise ValueError("occurred_at must be timezone-aware")
        return self

