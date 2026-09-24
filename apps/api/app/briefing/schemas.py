from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BriefCitation(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: Literal["source", "product_fact", "product_description", "policy"]
    reference_id: str
    evidence: str = Field(min_length=1, max_length=4000)


class GroundedBriefItem(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    text: str = Field(min_length=1, max_length=4000)
    citations: tuple[BriefCitation, ...] = Field(min_length=1)


class LabeledBriefItem(GroundedBriefItem):
    label: str = Field(min_length=1, max_length=100)


class PreCallBriefResponse(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    lead_id: UUID
    product_version_id: UUID
    policy_version: Literal["pre-call-brief.v1"] = "pre-call-brief.v1"
    opener: GroundedBriefItem
    likely_need: GroundedBriefItem
    fit_summary: GroundedBriefItem
    known_facts: tuple[LabeledBriefItem, ...]
    unknowns: tuple[str, ...]
    allowed_faq: tuple[LabeledBriefItem, ...]
    qualification_questions: tuple[LabeledBriefItem, ...]
    escalation_topics: tuple[LabeledBriefItem, ...]
    prohibited_claims: tuple[str, ...]

