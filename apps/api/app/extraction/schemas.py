from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Classification = Literal[
    "buyer_requirement",
    "weak_signal",
    "seller_pitch",
    "job_posting",
    "expired_requirement",
    "not_actionable",
]


class EvidenceClaim(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    value: str = Field(min_length=1, max_length=1000)
    quote: str = Field(min_length=1, max_length=1600)
    start: int = Field(ge=0)
    end: int = Field(gt=0)


class ExtractionResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal["requirement-extraction.v1"] = "requirement-extraction.v1"
    classification: Classification
    actionable: bool
    requirement_summary: EvidenceClaim | None = None
    category: EvidenceClaim | None = None
    industry: EvidenceClaim | None = None
    geography: EvidenceClaim | None = None
    urgency: EvidenceClaim | None = None
    explicit_deadline: EvidenceClaim | None = None
    company_clues: tuple[EvidenceClaim, ...] = ()
    unknown_fields: tuple[str, ...] = ()

    @model_validator(mode="after")
    def enforce_actionability(self) -> "ExtractionResult":
        if self.actionable != (self.classification == "buyer_requirement"):
            raise ValueError("only buyer requirements may be actionable")
        if self.actionable and self.requirement_summary is None:
            raise ValueError("actionable extraction requires a requirement summary")
        if not self.actionable and any(
            value is not None
            for value in (
                self.requirement_summary,
                self.category,
                self.industry,
                self.geography,
                self.urgency,
                self.explicit_deadline,
            )
        ):
            raise ValueError("non-actionable extraction cannot assert requirement fields")
        return self

    def validate_evidence(self, source: str) -> None:
        claims = [
            self.requirement_summary,
            self.category,
            self.industry,
            self.geography,
            self.urgency,
            self.explicit_deadline,
            *self.company_clues,
        ]
        for claim in (item for item in claims if item is not None):
            if claim.end > len(source) or claim.start >= claim.end:
                raise ValueError("evidence span is outside source text")
            if source[claim.start : claim.end] != claim.quote:
                raise ValueError("evidence quote does not exactly match source text")

