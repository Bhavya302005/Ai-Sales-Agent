from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import NAMESPACE_URL, UUID, uuid5

import httpx


class CrmPermanentError(ValueError):
    """The request needs operator action and must not be retried automatically."""


class CrmRetryableError(RuntimeError):
    """The provider may recover and the bounded job retry policy should run."""


@dataclass(frozen=True)
class CrmTaskPayload:
    local_id: UUID
    subject: str
    body: str
    due_at: datetime
    priority: str


@dataclass(frozen=True)
class CrmSyncResult:
    external_id: str
    external_url: str
    verified: bool


class CrmProvider(Protocol):
    name: str

    def sync_task(self, payload: CrmTaskPayload) -> CrmSyncResult: ...

    def verify_task(self, external_id: str) -> bool: ...


class MockCrmProvider:
    name = "mock"

    def sync_task(self, payload: CrmTaskPayload) -> CrmSyncResult:
        external_id = str(uuid5(NAMESPACE_URL, f"mock-crm-task:{payload.local_id}"))
        return CrmSyncResult(
            external_id=external_id,
            external_url=f"mock://crm/tasks/{external_id}",
            verified=True,
        )

    def verify_task(self, external_id: str) -> bool:
        try:
            UUID(external_id)
        except ValueError:
            return False
        return True


class HubSpotCrmProvider:
    name = "hubspot"

    def __init__(
        self,
        *,
        access_token: str,
        api_version: str = "2026-03",
        client: httpx.Client | None = None,
    ) -> None:
        self._version = api_version
        self._owns_client = client is None
        self._client = client or httpx.Client(
            base_url="https://api.hubapi.com",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(10, connect=5),
        )
        if client is not None:
            self._client.headers.update(
                {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
            )

    @property
    def _tasks_path(self) -> str:
        return f"/crm/objects/{self._version}/tasks"

    @staticmethod
    def _raise_for_provider(response: httpx.Response) -> None:
        if response.status_code in {401, 403}:
            raise CrmPermanentError("HubSpot credentials are invalid or revoked")
        if response.status_code in {400, 404, 409, 422}:
            raise CrmPermanentError(f"HubSpot rejected the task ({response.status_code})")
        if response.status_code == 429 or response.status_code >= 500:
            raise CrmRetryableError(f"HubSpot is temporarily unavailable ({response.status_code})")
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise CrmRetryableError("HubSpot request failed") from exc

    def sync_task(self, payload: CrmTaskPayload) -> CrmSyncResult:
        try:
            response = self._client.post(
                self._tasks_path,
                json={
                    "associations": [],
                    "properties": {
                        "hs_timestamp": payload.due_at.isoformat(),
                        "hs_task_subject": payload.subject,
                        "hs_task_body": payload.body,
                        "hs_task_status": "NOT_STARTED",
                        "hs_task_priority": "HIGH" if payload.priority == "high" else "NONE",
                    },
                },
            )
        except httpx.HTTPError as exc:
            raise CrmRetryableError("HubSpot could not be reached") from exc
        self._raise_for_provider(response)
        data = response.json()
        external_id = str(data.get("id", ""))
        if not external_id:
            raise CrmRetryableError("HubSpot returned no task identifier")
        verified = self.verify_task(external_id)
        if not verified:
            raise CrmRetryableError("HubSpot task could not be verified")
        return CrmSyncResult(
            external_id=external_id,
            external_url=str(data.get("url") or f"hubspot://tasks/{external_id}"),
            verified=True,
        )

    def verify_task(self, external_id: str) -> bool:
        try:
            response = self._client.get(f"{self._tasks_path}/{external_id}")
        except httpx.HTTPError as exc:
            raise CrmRetryableError("HubSpot verification failed") from exc
        self._raise_for_provider(response)
        return str(response.json().get("id", "")) == external_id

    def close(self) -> None:
        if self._owns_client:
            self._client.close()
