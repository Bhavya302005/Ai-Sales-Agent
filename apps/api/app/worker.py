from typing import Any
from uuid import UUID

from celery import Celery
from sqlalchemy.orm import Session

from app.campaign_ops import process_due_campaigns
from app.config import get_settings
from app.db import get_engine
from app.jobs.service import due_event_ids, process_event

settings = get_settings()
celery_app = Celery("sales_agent", broker=settings.rabbitmq_url)
celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
)
celery_app.conf.beat_schedule = {
    "campaigns-process-due-every-minute": {
        "task": "campaigns.process_due",
        "schedule": 60.0,
    },
}


@celery_app.task(name="system.ping")  # type: ignore[untyped-decorator]
def ping() -> str:
    return "pong"


@celery_app.task(  # type: ignore[untyped-decorator]
    bind=True,
    name="outbox.process",
    max_retries=4,
    acks_late=True,
)
def process_outbox_event(task: Any, event_id: str) -> dict[str, Any]:
    with Session(get_engine()) as session:
        result = process_event(session, UUID(event_id))
    if result.state == "retry_wait":
        raise task.retry(countdown=result.retry_after_seconds or 2)
    return {
        "event_id": str(result.event_id),
        "state": result.state,
        "attempts": result.attempts,
    }


@celery_app.task(name="outbox.process_due")  # type: ignore[untyped-decorator]
def process_due_outbox() -> int:
    with Session(get_engine()) as session:
        event_ids = due_event_ids(session)
    for event_id in event_ids:
        process_outbox_event.delay(str(event_id))
    return len(event_ids)


@celery_app.task(name="campaigns.process_due")  # type: ignore[untyped-decorator]
def process_due_campaign_runs() -> dict[str, int]:
    with Session(get_engine()) as session:
        result = process_due_campaigns(session)
    return result.model_dump()
