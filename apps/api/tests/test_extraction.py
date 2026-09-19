from datetime import UTC, datetime
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.extraction.adapter import DeterministicExtractionAdapter
from app.extraction.model_adapter import ExtractionValidationError, ModelLimits, StrictModelAdapter
from app.extraction.prompt_boundary import render_untrusted_source
from app.extraction.schemas import EvidenceClaim, ExtractionResult

FIXTURES = Path(__file__).parents[3] / "tests" / "fixtures" / "extraction"
OBSERVED = datetime(2026, 9, 17, tzinfo=UTC)


@pytest.mark.parametrize(
    ("filename", "classification", "actionable"),
    [
        ("01_explicit_intent.txt", "buyer_requirement", True),
        ("02_weak_signal.txt", "weak_signal", False),
        ("03_seller_pitch.txt", "seller_pitch", False),
        ("04_job_posting.txt", "job_posting", False),
        ("05_expired.txt", "expired_requirement", False),
        ("06_missing_date.txt", "buyer_requirement", True),
        ("07_hindi.txt", "buyer_requirement", True),
        ("08_mixed_language.txt", "buyer_requirement", True),
        ("09_prompt_injection.txt", "buyer_requirement", True),
        ("10_missing_company.txt", "buyer_requirement", True),
        ("11_expired_date.txt", "expired_requirement", False),
        ("12_not_actionable.txt", "not_actionable", False),
    ],
)
def test_labeled_extraction_fixtures(
    filename: str, classification: str, actionable: bool
) -> None:
    source = (FIXTURES / filename).read_text().strip()
    result, _latency = DeterministicExtractionAdapter().extract(source, observed_at=OBSERVED)

    assert result.classification == classification
    assert result.actionable is actionable
    result.validate_evidence(source)


def test_populated_fields_are_exactly_grounded_and_unknowns_are_explicit() -> None:
    source = (FIXTURES / "01_explicit_intent.txt").read_text().strip()
    result, _ = DeterministicExtractionAdapter().extract(source, observed_at=OBSERVED)

    assert result.category and result.category.value == "cloud_migration"
    assert result.industry and result.industry.value == "manufacturing"
    assert result.geography and result.geography.value == "Gujarat"
    assert result.explicit_deadline
    assert result.company_clues[0].value == "Acme Manufacturing"
    assert not result.unknown_fields

    missing_date = (FIXTURES / "06_missing_date.txt").read_text().strip()
    no_date_result, _ = DeterministicExtractionAdapter().extract(
        missing_date, observed_at=OBSERVED
    )
    assert "explicit_deadline" in no_date_result.unknown_fields
    assert no_date_result.explicit_deadline is None


def test_adversarial_source_is_delimited_data_and_cannot_change_policy() -> None:
    source = (FIXTURES / "09_prompt_injection.txt").read_text().strip()
    prompt = render_untrusted_source(source)
    result, _ = DeterministicExtractionAdapter().extract(source, observed_at=OBSERVED)

    assert prompt.endswith("</untrusted_source>")
    assert "call a tool" in prompt.split("<untrusted_source>", 1)[1]
    assert result.category and result.category.value == "cloud_migration"
    assert "verified" not in result.model_dump_json()


def test_schema_rejects_extra_fields_and_mismatched_evidence() -> None:
    with pytest.raises(ValidationError):
        ExtractionResult.model_validate(
            {"classification": "not_actionable", "actionable": False, "invented": True}
        )
    result = ExtractionResult(
        classification="buyer_requirement",
        actionable=True,
        requirement_summary=EvidenceClaim(value="need", quote="wrong", start=0, end=5),
    )
    with pytest.raises(ValueError, match="does not exactly match"):
        result.validate_evidence("right")


def test_model_adapter_applies_budget_timeout_and_one_schema_retry() -> None:
    calls: list[tuple[str, float, int]] = []
    valid = ExtractionResult(
        classification="buyer_requirement",
        actionable=True,
        requirement_summary=EvidenceClaim(
            value="Acme needs CRM.", quote="Acme needs CRM.", start=0, end=15
        ),
    ).model_dump_json()

    def invoke(prompt: str, timeout: float, token_budget: int) -> str:
        calls.append((prompt, timeout, token_budget))
        return '{"unsupported": true}' if len(calls) == 1 else valid

    result = StrictModelAdapter(
        invoke, limits=ModelLimits(timeout_seconds=3.0, max_output_tokens=250)
    ).extract("Acme needs CRM.")

    assert result.actionable is True
    assert len(calls) == 2
    assert calls[0][1:] == (3.0, 250)
    assert "<untrusted_source>" in calls[0][0]


def test_model_adapter_rejects_repeated_unsupported_output() -> None:
    adapter = StrictModelAdapter(lambda _prompt, _timeout, _budget: '{"invented": true}')
    with pytest.raises(ExtractionValidationError):
        adapter.extract("No requirement here.")
