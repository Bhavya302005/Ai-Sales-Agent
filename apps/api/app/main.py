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
from app.calling.api import router as calling_router
from app.campaign_ops import router as campaign_ops_router
from app.company_api import router as company_router
from app.config import get_settings
from app.crm.api import router as crm_router
from app.discovery.api import router as discovery_router
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

VERSION = "0.1.0"


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    get_settings()
    yield


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
