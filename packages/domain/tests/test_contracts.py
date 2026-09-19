from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from sales_agent_domain import EvidenceRef, FieldAssertion
from sales_agent_domain.models import AssertionStatus

NOW = datetime.now(UTC)


def test_unknown_assertion_cannot_smuggle_a_value() -> None:
    with pytest.raises(ValidationError, match="unknown assertions cannot contain a value"):
        FieldAssertion(
            id=uuid4(),
            organization_id=uuid4(),
            entity_type="lead",
            entity_id=uuid4(),
            field_name="budget",
            value="INR 10 lakh",
            source_document_id=None,
            evidence=None,
            extraction_method="fixture",
            confidence=0,
            observed_at=NOW,
            status=AssertionStatus.UNKNOWN,
            created_at=NOW,
            updated_at=NOW,
        )


def test_populated_assertion_requires_evidence() -> None:
    with pytest.raises(ValidationError, match="require source evidence"):
        FieldAssertion(
            id=uuid4(),
            organization_id=uuid4(),
            entity_type="lead",
            entity_id=uuid4(),
            field_name="urgency",
            value="high",
            source_document_id=None,
            evidence=None,
            extraction_method="model",
            confidence=0.8,
            observed_at=NOW,
            status=AssertionStatus.SINGLE_SOURCE,
            created_at=NOW,
            updated_at=NOW,
        )


def test_evidence_offsets_must_be_complete_and_ordered() -> None:
    with pytest.raises(ValidationError, match="supplied together"):
        EvidenceRef(
            source_document_id=uuid4(),
            excerpt="Cloud migration required",
            start_offset=10,
            confidence=1,
        )
