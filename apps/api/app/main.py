import asyncio
import logging
import re
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from app.admin_api import router as admin_router
from app.analytics_api import router as analytics_router
from app.api import router as api_router
from app.booking_followups.api import router as booking_followups_router
from app.calling.api import router as calling_router
from app.campaign_ops import router as campaign_ops_router
from app.company_api import router as company_router
from app.config import get_settings
from app.crm.api import router as crm_router
from app.discovery.api import router as discovery_router
from app.email_outreach.api import router as email_outreach_router
from app.hubspot_import import router as hubspot_import_router
from app.jobs.api import router as jobs_router
from app.knowledge_api import router as knowledge_router
from app.lead_import import router as lead_import_router
from app.leads_api import router as leads_router
from app.notifications import router as notifications_router
from app.outcomes.api import router as outcomes_router
from app.readiness import broker_is_ready, database_is_ready
from app.schemas import HealthResponse, ReadinessCheck, ReadinessResponse
from app.source_api import router as source_router
from app.subscription_api import router as subscription_router

VERSION = "0.1.0"
logger = logging.getLogger(__name__)


def _process_booking_scheduler_tick() -> None:
    from sqlalchemy.orm import Session

    from app.campaign_ops import process_due_campaigns
    from app.db import get_engine

    with Session(get_engine()) as session:
        process_due_campaigns(session, settings=get_settings())


async def _inline_booking_scheduler() -> None:
    while True:
        await asyncio.sleep(60)
        try:
            await run_in_threadpool(_process_booking_scheduler_tick)
        except Exception:
            logger.exception("Inline booking scheduler tick failed")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    scheduler = (
        asyncio.create_task(_inline_booking_scheduler())
        if settings.booking_scheduler_mode == "inline"
        else None
    )
    try:
        yield
    finally:
        if scheduler:
            scheduler.cancel()


app = FastAPI(
    title="AI Sales Agent API",
    version=VERSION,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().web_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
)
app.include_router(api_router)
app.include_router(lead_import_router)
app.include_router(leads_router)
app.include_router(knowledge_router)
app.include_router(source_router)
app.include_router(company_router)
app.include_router(jobs_router)
app.include_router(calling_router)
app.include_router(outcomes_router)
app.include_router(crm_router)
app.include_router(analytics_router)
app.include_router(discovery_router)
app.include_router(notifications_router)
app.include_router(admin_router)
app.include_router(campaign_ops_router)
app.include_router(hubspot_import_router)
app.include_router(subscription_router)
app.include_router(email_outreach_router)
app.include_router(booking_followups_router)


@app.middleware("http")
async def request_id_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    supplied_request_id = request.headers.get("X-Request-ID", "")
    request_id = (
        supplied_request_id
        if len(supplied_request_id) <= 100
        and re.fullmatch(r"[A-Za-z0-9._:-]+", supplied_request_id)
        else str(uuid4())
    )
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if get_settings().app_env == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.get("/health/live", response_model=HealthResponse, tags=["health"])
async def health_live() -> HealthResponse:
    return HealthResponse(status="ok", service="api", version=VERSION)


@app.get("/health/ready", response_model=ReadinessResponse, tags=["health"])
async def health_ready(response: Response) -> ReadinessResponse:
    settings = get_settings()
    database_ok = await run_in_threadpool(database_is_ready, settings.database_url)
    broker_required = settings.async_mode == "celery"
    broker_ok = (
        await run_in_threadpool(broker_is_ready, settings.rabbitmq_url)
        if broker_required
        else None
    )
    ready = database_ok and (broker_ok is True if broker_required else True)
    if not ready:
        response.status_code = 503
    return ReadinessResponse(
        status="ok" if ready else "degraded",
        service="api",
        version=VERSION,
        checks=[
            ReadinessCheck(name="configuration", status="ok"),
            ReadinessCheck(name="database", status="ok" if database_ok else "unavailable"),
            ReadinessCheck(
                name="broker",
                status=(
                    "not_configured"
                    if not broker_required
                    else ("ok" if broker_ok else "unavailable")
                ),
            ),
        ],
    )
