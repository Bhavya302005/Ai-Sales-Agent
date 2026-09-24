from datetime import UTC, datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, model_validator


class DomainModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)


class TimestampedModel(DomainModel):
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def timestamps_are_utc_and_ordered(self) -> Self:
        for value in (self.created_at, self.updated_at):
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError("timestamps must be timezone-aware")
        if self.updated_at < self.created_at:
            raise ValueError("updated_at cannot precede created_at")
        return self


def utc_now() -> datetime:
    return datetime.now(UTC)
