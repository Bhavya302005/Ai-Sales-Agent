from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.persistence.models import Call, Company, ExternalMapping, Lead, Requirement


class OmniDimPermanentError(ValueError):
    """The operator must change configuration or input before trying again."""


class OmniDimRetryableError(RuntimeError):
    """The provider or network may recover without changing the request."""


@dataclass(frozen=True)
class OmniDimDispatch:
    request_id: str
    status: str


@dataclass(frozen=True)
class OmniDimCallResult:
    status: str
    interactions: list[dict[str, Any]]
    duration_seconds: int
    estimated_cost: float | None
    sentiment: str | None
    summary: str | None
    recording_url: str | None
    extracted_variables: dict[str, Any]


class OmniDimClient:
    def __init__(self, settings: Settings, *, client: httpx.Client | None = None) -> None:
        if not settings.omnidim_api_key:
            raise OmniDimPermanentError("OmniDimension API key is not configured")
        self._agent_id = settings.omnidim_agent_id
        self._from_number_id = settings.omnidim_from_number_id
        self._to_number = (
            settings.omnidim_test_to_number.get_secret_value()
            if settings.omnidim_test_to_number
            else None
        )
        self._owns_client = client is None
        self._client = client or httpx.Client(
            base_url=settings.omnidim_api_base_url.rstrip("/"),
            timeout=httpx.Timeout(15, connect=5),
        )
        self._client.headers.update(
            {
                "Authorization": f"Bearer {settings.omnidim_api_key.get_secret_value()}",
                "Content-Type": "application/json",
            }
        )

    @staticmethod
    def _check(response: httpx.Response) -> None:
        if response.status_code in {400, 401, 403, 404, 409, 422}:
            raise OmniDimPermanentError(
                f"OmniDimension rejected the request ({response.status_code})"
            )
        if response.status_code == 429 or response.status_code >= 500:
            raise OmniDimRetryableError(
                f"OmniDimension is temporarily unavailable ({response.status_code})"
            )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise OmniDimRetryableError("OmniDimension request failed") from exc

    def dispatch(self, *, call_id: UUID, context: dict[str, str]) -> OmniDimDispatch:
        if self._agent_id is None or self._to_number is None:
            raise OmniDimPermanentError("OmniDimension agent and test number are not configured")
        payload: dict[str, Any] = {
            "agent_id": self._agent_id,
            "to_number": self._to_number,
            "call_context": context,
            "metadata": {"local_call_id": str(call_id), "source": "signalpath_demo"},
        }
        if self._from_number_id is not None:
            payload["from_number_id"] = self._from_number_id
        try:
            response = self._client.post("/calls/dispatch", json=payload)
        except httpx.HTTPError as exc:
            raise OmniDimRetryableError("OmniDimension could not be reached") from exc
        self._check(response)
        try:
            data = response.json()
            request_id = str(int(data["requestId"]))
            success = data.get("success") is True
        except (ValueError, TypeError, KeyError) as exc:
            raise OmniDimRetryableError(
                "OmniDimension returned an invalid dispatch response"
            ) from exc
        if not success:
            raise OmniDimPermanentError("OmniDimension did not accept the call")
        return OmniDimDispatch(
            request_id=request_id,
            status=str(data.get("status") or "dispatched"),
        )

    def result(self, request_id: str) -> OmniDimCallResult | None:
        try:
            response = self._client.get(
                "/calls/logs",
                params={"pageno": 1, "pagesize": 150, "agentid": self._agent_id},
            )
        except httpx.HTTPError as exc:
            raise OmniDimRetryableError("OmniDimension could not be reached") from exc
        self._check(response)
        try:
            data = response.json()
            rows = data.get("call_log_data", [])
            if not isinstance(rows, list):
                raise ValueError
        except (ValueError, TypeError, AttributeError) as exc:
            raise OmniDimRetryableError("OmniDimension returned invalid call logs") from exc
        for row in rows:
            if not isinstance(row, dict):
                continue
            reference = row.get("call_request_id")
            candidate = reference.get("id") if isinstance(reference, dict) else reference
            if str(candidate) != request_id:
                continue
            interactions = row.get("interactions")
            variables = row.get("extracted_variables")
            raw_report = row.get("call_report")
            report: dict[str, Any] = raw_report if isinstance(raw_report, dict) else {}
            summary = report.get("summary") or row.get("sentiment_analysis_details")
            recording_url = row.get("internal_recording_url") or row.get("recording_url")
            if not isinstance(recording_url, str) or not recording_url.startswith("https://"):
                recording_url = None
            return OmniDimCallResult(
                status=str(row.get("call_status") or "unknown").replace("-", "_"),
                interactions=interactions if isinstance(interactions, list) else [],
                duration_seconds=max(0, int(row.get("call_duration_in_seconds") or 0)),
                estimated_cost=(
                    float(row["aggregated_estimated_cost"])
                    if isinstance(row.get("aggregated_estimated_cost"), int | float)
                    else None
                ),
                sentiment=(
                    str(row["sentiment_score"])[:100] if row.get("sentiment_score") else None
                ),
                summary=str(summary)[:2000] if summary else None,
                recording_url=recording_url,
                extracted_variables=variables if isinstance(variables, dict) else {},
            )
        return None

    def recording(self, request_id: str) -> tuple[bytes, str] | None:
        result = self.result(request_id)
        if result is None or result.recording_url is None:
            return None
        parsed = urlparse(result.recording_url)
        hostname = (parsed.hostname or "").lower()
        if (
            parsed.scheme != "https"
            or parsed.username
            or parsed.password
            or not (hostname == "omnidim.io" or hostname.endswith(".omnidim.io"))
        ):
            raise OmniDimPermanentError("OmniDimension returned an invalid recording location")
        try:
            response = self._client.get(
                result.recording_url,
                timeout=httpx.Timeout(30, connect=5),
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise OmniDimRetryableError(
                "OmniDimension recording is temporarily unavailable"
            ) from exc
        if len(response.content) > 25_000_000:
            raise OmniDimPermanentError("OmniDimension recording exceeds the playback limit")
        media_type = response.headers.get("content-type", "audio/mpeg").split(";", 1)[0]
        if not media_type.startswith("audio/"):
            media_type = "audio/mpeg"
        return response.content, media_type

    def close(self) -> None:
        if self._owns_client:
            self._client.close()


def provider_mapping(session: Session, *, call_id: UUID) -> ExternalMapping | None:
    return session.scalar(
        select(ExternalMapping).where(
            ExternalMapping.provider == "omnidim",
            ExternalMapping.local_type == "call",
            ExternalMapping.local_id == call_id,
            ExternalMapping.external_type == "call_request",
        )
    )


def _call_context(session: Session, call: Call) -> dict[str, str]:
    row = session.execute(
        select(Requirement.normalized_need, Company.normalized_name)
        .join(Lead, Lead.requirement_id == Requirement.id)
        .outerjoin(Company, Company.id == Lead.company_id)
        .where(Lead.id == call.lead_id, Lead.organization_id == call.organization_id)
    ).one_or_none()
    requirement, company = row if row else ("Unknown", "Unknown company")
    return {
        "local_call_id": str(call.id),
        "company": str(company or "Unknown company")[:200],
        "business_requirement": str(requirement or "Unknown")[:500],
        "consent_scope": "single consented hackathon qualification call",
    }


def dispatch_omnidim_call(
    session: Session,
    *,
    call: Call,
    settings: Settings,
    client: OmniDimClient | None = None,
) -> OmniDimDispatch:
    if call.transport != "omnidim" or call.state not in {"eligible", "connecting"}:
        raise ValueError("only an eligible OmniDimension call can be dispatched")
    locked_call = session.scalar(
        select(Call)
        .where(Call.id == call.id, Call.organization_id == call.organization_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if locked_call is None:
        raise ValueError("call no longer exists")
    call = locked_call
    existing = provider_mapping(session, call_id=call.id)
    if existing:
        call.state = "connecting"
        session.commit()
        return OmniDimDispatch(request_id=existing.external_id, status="existing")
    adapter = client or OmniDimClient(settings)
    try:
        result = adapter.dispatch(call_id=call.id, context=_call_context(session, call))
    except Exception:
        call.state = "failed"
        call.outcome = "provider_dispatch_failed"
        call.usage = {**call.usage, "reservation_status": "released"}
        session.commit()
        raise
    finally:
        if client is None:
            adapter.close()
    session.add(
        ExternalMapping(
            organization_id=call.organization_id,
            provider="omnidim",
            local_type="call",
            local_id=call.id,
            external_type="call_request",
            external_id=result.request_id,
        )
    )
    call.state = "connecting"
    call.started_at = call.started_at or datetime.now(UTC)
    call.usage = {**call.usage, "provider_status": result.status}
    session.commit()
    return result
