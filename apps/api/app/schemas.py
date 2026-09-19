from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    service: str
    version: str


class ReadinessCheck(BaseModel):
    name: str
    status: Literal["ok", "unavailable", "not_configured"]


class ReadinessResponse(HealthResponse):
    checks: list[ReadinessCheck]

