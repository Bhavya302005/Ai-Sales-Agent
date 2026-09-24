from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ICPDefinition(BaseModel):
    geographies: list[str] = Field(min_length=1, max_length=20)
    industries: list[str] = Field(min_length=1, max_length=30)
    needs: list[str] = Field(min_length=1, max_length=30)

    @field_validator("geographies", "industries", "needs")
    @classmethod
    def clean_values(cls, values: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(value.strip() for value in values if value.strip()))
        if not cleaned:
            raise ValueError("at least one non-empty value is required")
        return cleaned


class OfferingVersionCreate(BaseModel):
    description: str = Field(min_length=20, max_length=4000)
    icp: ICPDefinition
    exclusions: list[str] = Field(min_length=1, max_length=30)
    facts: dict[str, str] = Field(min_length=1, max_length=50)
    pricing_policy: str = Field(min_length=10, max_length=2000)
    qualification_questions: list[str] = Field(min_length=1, max_length=20)
    handoff_conditions: list[str] = Field(min_length=1, max_length=20)

    @field_validator("exclusions", "qualification_questions", "handoff_conditions")
    @classmethod
    def clean_lists(cls, values: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(value.strip() for value in values if value.strip()))
        if not cleaned:
            raise ValueError("at least one non-empty value is required")
        return cleaned

    @field_validator("facts")
    @classmethod
    def clean_facts(cls, values: dict[str, str]) -> dict[str, str]:
        cleaned = {
            key.strip(): value.strip()
            for key, value in values.items()
            if key.strip() and value.strip()
        }
        if not cleaned:
            raise ValueError("at least one factual answer is required")
        return cleaned


class OfferingVersionResponse(BaseModel):
    id: UUID
    version: int
    description: str
    icp: ICPDefinition
    exclusions: list[str]
    facts: dict[str, str]
    pricing_policy: str
    qualification_questions: list[str]
    handoff_conditions: list[str]
    approved_at: datetime | None
    approved_by: UUID | None
    is_active: bool
    is_callable: bool
    created_at: datetime
    company_url: str | None = None
    services: list[str] = []
    target_customers: list[str] = []
    analysis_method: str | None = None
    profile_source_count: int = 0


class OfferingResponse(BaseModel):
    product_id: UUID
    product_name: str
    active_version_id: UUID | None
    versions: list[OfferingVersionResponse]


class ApprovalRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


class BusinessProfileSource(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    kind: Literal["website", "document", "user_input"]
    content_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    excerpt: str = Field(min_length=1, max_length=600)


class BusinessProfileAnalysisResponse(BaseModel):
    company_name: str
    company_url: str | None
    description: str
    services: list[str]
    icp: ICPDefinition
    target_customers: list[str]
    facts: dict[str, str]
    exclusions: list[str]
    pricing_policy: str
    qualification_questions: list[str]
    handoff_conditions: list[str]
    sources: list[BusinessProfileSource]
    analysis_method: Literal["gemini", "deterministic"]
    warning: str | None
    analysis_token: str


class BusinessProfileConfirm(BaseModel):
    company_name: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=20, max_length=4000)
    services: list[str] = Field(min_length=1, max_length=20)
    icp: ICPDefinition
    target_customers: list[str] = Field(min_length=1, max_length=20)
    facts: dict[str, str] = Field(min_length=1, max_length=50)
    exclusions: list[str] = Field(min_length=1, max_length=30)
    pricing_policy: str = Field(min_length=10, max_length=2000)
    qualification_questions: list[str] = Field(min_length=1, max_length=20)
    handoff_conditions: list[str] = Field(min_length=1, max_length=20)
    analysis_token: str = Field(min_length=20, max_length=20_000)
    workflow_mode: Literal["leads_and_calling", "calling_only"]
    confirmed: Literal[True]


class KnowledgeSearchResponse(BaseModel):
    product_id: UUID
    product_version_id: UUID
    product_name: str
    description: str
    matched_facts: dict[str, str]
