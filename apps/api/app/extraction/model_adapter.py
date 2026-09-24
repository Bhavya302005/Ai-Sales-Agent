from collections.abc import Callable
from dataclasses import dataclass

from pydantic import ValidationError

from app.extraction.prompt_boundary import render_untrusted_source
from app.extraction.schemas import ExtractionResult


class ExtractionValidationError(ValueError):
    """A provider repeatedly returned unsupported or ungrounded output."""


@dataclass(frozen=True)
class ModelLimits:
    timeout_seconds: float = 8.0
    max_output_tokens: int = 700
    max_schema_attempts: int = 2


ModelInvoker = Callable[[str, float, int], str]


class StrictModelAdapter:
    """Provider-neutral bounded adapter retained for a future configured extraction model."""

    def __init__(self, invoke: ModelInvoker, *, limits: ModelLimits | None = None) -> None:
        self._invoke = invoke
        self._limits = limits or ModelLimits()

    def extract(self, source: str) -> ExtractionResult:
        prompt = render_untrusted_source(source)
        last_error: ValidationError | ValueError | None = None
        for _attempt in range(self._limits.max_schema_attempts):
            raw = self._invoke(
                prompt,
                self._limits.timeout_seconds,
                self._limits.max_output_tokens,
            )
            try:
                result = ExtractionResult.model_validate_json(raw)
                result.validate_evidence(source)
                return result
            except (ValidationError, ValueError) as exc:
                last_error = exc
        raise ExtractionValidationError(
            "provider output failed strict schema/evidence validation"
        ) from last_error
