import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from sales_agent_domain import EventEnvelope

FIXTURE = Path(__file__).parents[3] / "tests/contract/fixtures/lead.extraction_requested.v1.json"


def test_versioned_event_fixture_validates() -> None:
    event = EventEnvelope.model_validate_json(FIXTURE.read_text())
    assert event.event_type == "lead.extraction_requested.v1"
    assert event.schema_version == 1


def test_event_rejects_untrusted_tenant_alias() -> None:
    payload = json.loads(FIXTURE.read_text())
    payload["tenant_id"] = payload["organization_id"]
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        EventEnvelope.model_validate(payload)

