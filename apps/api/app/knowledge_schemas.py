from datetime import datetime
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


class OfferingResponse(BaseModel):
    product_id: UUID
    product_name: str
    active_version_id: UUID | None
    versions: list[OfferingVersionResponse]


class ApprovalRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


class KnowledgeSearchResponse(BaseModel):
    product_id: UUID
    product_version_id: UUID
    product_name: str
    description: str
    matched_facts: dict[str, str]
