from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.briefing.schemas import PreCallBriefResponse


class LeadSummaryResponse(BaseModel):
    id: UUID
    lifecycle: str
    company_name: str | None
    normalized_need: str
    source_url: str
    published_at: datetime | None
    score: int | None
    score_confidence: float | None = Field(default=None, ge=0, le=1)


class AssertionResponse(BaseModel):
    id: UUID
    field_name: str
    value: dict[str, Any] | None
    status: str
    confidence: float = Field(ge=0, le=1)
    evidence_excerpt: str | None
    observed_at: datetime
    source_url: str | None


class ScoreContributionResponse(BaseModel):
    feature: str
    value: float = Field(ge=0, le=1)
    weight: float = Field(ge=0, le=1)
    points: float = Field(ge=0, le=100)


class ScoreDetailResponse(BaseModel):
    total: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    explanation: str
    rule_version: str
    contributions: list[ScoreContributionResponse]


class SourceResponse(BaseModel):
    url: str
    source_type: str
    rights_note: str
    published_at: datetime | None
    observed_at: datetime
    evidence_excerpt: str


class OfferingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version: int
    description: str
    pricing_policy: str
    approved_at: datetime | None


class LeadDetailResponse(LeadSummaryResponse):
    source: SourceResponse
    assertions: list[AssertionResponse]
    score_detail: ScoreDetailResponse | None
    offering: OfferingResponse
    unknown_fields: list[str]
    pre_call_brief: PreCallBriefResponse | None
