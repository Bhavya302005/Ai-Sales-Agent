import asyncio
import hashlib
import json
from contextlib import suppress
from datetime import UTC, datetime
from time import monotonic
from typing import Annotated, Any, Literal
from urllib.parse import urlparse
from uuid import UUID

from fastapi import (
    Cookie,
    FastAPI,
    HTTPException,
    Request,
    Response,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.websockets import WebSocketState

from app.auth import AuthContext, authenticate_access_token
from app.config import Settings, get_settings
from app.conversation.dialogue_adapter import build_dialogue_adapter
from app.conversation.state_machine import (
    CONVERSATION_POLICY_VERSION,
    ConversationSession,
    DialogueReply,
    create_conversation_session,
)
from app.db import get_engine
from app.main import VERSION
from app.persistence.models import Call, ExternalMapping, ProviderWebhookEvent, TranscriptSegment
from app.sarvam import bridge_realtime, sarvam_tts_stream
from app.schemas import HealthResponse
from app.twilio_voice import (
    build_conversation_relay_twiml,
    public_http_url,
    public_websocket_url,
    validate_twilio_request,
)
from app.voice_sessions import (
    VoiceCallContext,
    complete_voice_call,
    parse_browser_voice_message,
    record_final_segment,
    record_voice_latency,
    should_stop_call,
    start_provider_voice_call,
    start_voice_call,
)

app = FastAPI(title="AI Sales Agent Voice Service", version=VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    language_code: Literal["en-IN", "hi-IN"] = "en-IN"


def _authenticate_cookie(token: str | None, settings: Settings) -> AuthContext:
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    with Session(get_engine()) as session:
        return authenticate_access_token(token, settings, session)


def _start_voice_call(call_id: UUID, auth: AuthContext, settings: Settings) -> VoiceCallContext:
    with Session(get_engine()) as session:
        return start_voice_call(session, call_id=call_id, auth=auth, settings=settings)


def _record_segment(
    context: VoiceCallContext,
    sequence: int,
    speaker: Literal["agent", "participant"],
    text: str,
    language: Literal["en-IN", "hi-IN"],
    started_ms: int,
    ended_ms: int,
) -> None:
    with Session(get_engine()) as session:
        record_final_segment(
            session,
            context=context,
            sequence=sequence,
            speaker=speaker,
            text=text,
            language=language,
            started_ms=started_ms,
            ended_ms=ended_ms,
        )


def _should_stop(context: VoiceCallContext, settings: Settings) -> bool:
    with Session(get_engine()) as session:
        return should_stop_call(session, context, settings)


def _complete_call(context: VoiceCallContext, outcome: str) -> None:
    with Session(get_engine()) as session:
        complete_voice_call(session, context=context, outcome=outcome)


def _record_latency(context: VoiceCallContext, latency_ms: int) -> None:
    with Session(get_engine()) as session:
        record_voice_latency(session, context=context, latency_ms=latency_ms)


def _valid_twilio_http_request(request: Request, settings: Settings, form: Any) -> bool:
    path = request.url.path
    candidates = {public_http_url(settings, path)}
    forwarded_proto = request.headers.get("X-Forwarded-Proto", "").split(",", 1)[0].strip()
    forwarded_host = request.headers.get("X-Forwarded-Host", "").split(",", 1)[0].strip()
    configured_host = urlparse(str(settings.public_voice_base_url)).netloc
    if forwarded_proto == "https" and forwarded_host == configured_host:
        candidates.add(f"https://{forwarded_host}{path}")
    signature = request.headers.get("X-Twilio-Signature")
    return any(
        validate_twilio_request(settings, url=url, params=form, signature=signature)
        for url in candidates
    )


def _create_conversation(
    context: VoiceCallContext, language: Literal["en-IN", "hi-IN"]
) -> ConversationSession:
    settings = get_settings()
    with Session(get_engine()) as session:
        return create_conversation_session(
            session,
            context=context,
            language=language,
            dialogue_adapter=build_dialogue_adapter(settings),
        )


def _handle_turn(conversation: ConversationSession, text: str) -> DialogueReply:
    with Session(get_engine()) as session:
        return conversation.handle_turn(session, text)


def _start_provider_call(
    call_id: UUID, provider_call_sid: str, settings: Settings
) -> VoiceCallContext:
    with Session(get_engine()) as session:
        return start_provider_voice_call(
            session,
            call_id=call_id,
            provider_call_sid=provider_call_sid,
            settings=settings,
        )


def _provider_call(call_id: UUID, provider_call_sid: str) -> Call | None:
    with Session(get_engine()) as session:
        return session.scalar(
            select(Call)
            .join(
                ExternalMapping,
                (ExternalMapping.local_id == Call.id)
                & (ExternalMapping.organization_id == Call.organization_id),
            )
            .where(
                Call.id == call_id,
                Call.transport == "twilio",
                ExternalMapping.provider == "twilio",
                ExternalMapping.local_type == "call",
                ExternalMapping.external_type == "call",
                ExternalMapping.external_id == provider_call_sid,
            )
        )


def _unsigned_trial_callback_allowed(
    call_id: UUID, provider_call_sid: str, settings: Settings
) -> bool:
    if settings.app_env not in {"development", "test"}:
        return False
    call = _provider_call(call_id, provider_call_sid)
    return bool(
        call
        and call.state in {"connecting", "active", "ending"}
        and call.usage.get("provider_callback_mode") == "trial_limited"
    )


def _next_transcript_sequence(context: VoiceCallContext) -> int:
    with Session(get_engine()) as session:
        latest = session.scalar(
            select(func.max(TranscriptSegment.sequence)).where(
                TranscriptSegment.organization_id == context.organization_id,
                TranscriptSegment.call_id == context.call_id,
            )
        )
        return int(latest or 0) + 1


def _record_twilio_status(
    *,
    provider_call_sid: str,
    provider_status: str,
    sequence_number: int,
    payload_hash: str,
) -> None:
    terminal_failed = {"busy", "failed", "no-answer", "canceled"}
    allowed_statuses = {
        "queued",
        "initiated",
        "ringing",
        "in-progress",
        "completed",
        *terminal_failed,
    }
    if provider_status not in allowed_statuses or sequence_number < 0:
        raise ValueError("invalid Twilio call status")
    with Session(get_engine()) as session:
        mapping = session.scalar(
            select(ExternalMapping).where(
                ExternalMapping.provider == "twilio",
                ExternalMapping.external_type == "call",
                ExternalMapping.external_id == provider_call_sid,
            )
        )
        if mapping is None:
            raise LookupError("provider call mapping not found")
        event_id = f"{provider_call_sid}:{sequence_number}"
        existing = session.scalar(
            select(ProviderWebhookEvent).where(
                ProviderWebhookEvent.provider == "twilio",
                ProviderWebhookEvent.provider_event_id == event_id,
            )
        )
        if existing:
            return
        event = ProviderWebhookEvent(
            organization_id=mapping.organization_id,
            provider="twilio",
            provider_event_id=event_id,
            payload_hash=payload_hash,
            status="processing",
        )
        session.add(event)
        call = session.scalar(
            select(Call).where(
                Call.id == mapping.local_id,
                Call.organization_id == mapping.organization_id,
            )
        )
        if call is None:
            raise LookupError("call not found")
        last_sequence = int(call.usage.get("provider_status_sequence", -1))
        if sequence_number >= last_sequence:
            call.usage = {
                **call.usage,
                "provider_status": provider_status,
                "provider_status_sequence": sequence_number,
            }
            if provider_status == "in-progress" and call.state == "connecting":
                call.state = "active"
                call.started_at = call.started_at or datetime.now(UTC)
            elif provider_status in terminal_failed and call.state not in {
                "completed",
                "failed",
                "blocked",
            }:
                call.state = "failed"
                call.ended_at = datetime.now(UTC)
                call.outcome = f"twilio_{provider_status.replace('-', '_')}"
                call.usage = {**call.usage, "reservation_status": "released"}
            elif provider_status == "completed" and call.state not in {
                "completed",
                "failed",
                "blocked",
            }:
                context = VoiceCallContext(
                    call_id=call.id,
                    organization_id=call.organization_id,
                    transport=call.transport,
                    max_duration_seconds=call.max_duration_seconds,
                    started_at=call.started_at or datetime.now(UTC),
                )
                event.status = "processed"
                event.processed_at = datetime.now(UTC)
                complete_voice_call(session, context=context, outcome="twilio_completed")
                return
        event.status = "processed"
        event.processed_at = datetime.now(UTC)
        session.commit()


def _fail_twilio_session(
    *,
    call_id: UUID,
    provider_call_sid: str,
    session_status: str,
    error_code: str,
) -> None:
    with Session(get_engine()) as session:
        call = session.scalar(
            select(Call)
            .join(
                ExternalMapping,
                (ExternalMapping.local_id == Call.id)
                & (ExternalMapping.organization_id == Call.organization_id),
            )
            .where(
                Call.id == call_id,
                Call.transport == "twilio",
                ExternalMapping.provider == "twilio",
                ExternalMapping.local_type == "call",
                ExternalMapping.external_type == "call",
                ExternalMapping.external_id == provider_call_sid,
            )
        )
        if call is None:
            raise LookupError("call not found")
        if call.state in {"failed", "blocked"}:
            return
        # A provider failure callback is authoritative over infrastructure fallback outcomes,
        # but never overwrites a participant/business outcome already completed by the
        # state machine.
        if call.state == "completed" and call.outcome not in {
            "provider_disconnected",
            "provider_error",
            "invalid_provider_message",
            "provider_session_ended",
            "twilio_completed",
        }:
            return
        call.state = "failed"
        call.ended_at = datetime.now(UTC)
        call.outcome = "twilio_conversation_relay_failed"
        call.usage = {
            **call.usage,
            "reservation_status": "released",
            "provider_session_status": session_status,
            **({"provider_error_code": error_code} if error_code else {}),
        }
        session.commit()


@app.get("/health/live", response_model=HealthResponse, tags=["health"])
async def health_live() -> HealthResponse:
    return HealthResponse(status="ok", service="voice", version=VERSION)


@app.post("/api/v1/twilio/calls/{call_id}/twiml")
async def twilio_call_twiml(call_id: UUID, request: Request) -> Response:
    settings = get_settings()
    form = await request.form()
    signature_valid = _valid_twilio_http_request(request, settings, form)
    provider_sid = str(form.get("CallSid", ""))
    if not provider_sid or str(form.get("AccountSid", "")) != settings.twilio_account_sid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid CallSid and AccountSid are required",
        )
    if not signature_valid and not await run_in_threadpool(
        _unsigned_trial_callback_allowed, call_id, provider_sid, settings
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Twilio signature"
        )
    try:
        context = await run_in_threadpool(_start_provider_call, call_id, provider_sid, settings)
        conversation = await run_in_threadpool(
            _create_conversation, context, settings.twilio_conversation_language
        )
        await run_in_threadpool(
            _record_segment,
            context,
            0,
            "agent",
            conversation.disclosure,
            settings.twilio_conversation_language,
            0,
            0,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found") from exc
    except (PermissionError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    twiml = build_conversation_relay_twiml(
        settings,
        call_id=call_id,
        welcome_greeting=conversation.disclosure,
    )
    return Response(content=twiml, media_type="application/xml")


@app.post("/api/v1/twilio/calls/status", status_code=204)
async def twilio_call_status(request: Request) -> Response:
    settings = get_settings()
    form = await request.form()
    if not _valid_twilio_http_request(request, settings, form):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Twilio signature"
        )
    provider_sid = str(form.get("CallSid", ""))
    provider_status = str(form.get("CallStatus", ""))
    try:
        sequence_number = int(str(form.get("SequenceNumber", "0")))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid SequenceNumber"
        ) from exc
    if (
        not provider_sid
        or not provider_status
        or str(form.get("AccountSid", "")) != settings.twilio_account_sid
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid AccountSid, CallSid, and CallStatus are required",
        )
    payload_hash = hashlib.sha256(
        json.dumps(sorted((str(key), str(value)) for key, value in form.multi_items())).encode()
    ).hexdigest()
    try:
        await run_in_threadpool(
            _record_twilio_status,
            provider_call_sid=provider_sid,
            provider_status=provider_status,
            sequence_number=sequence_number,
            payload_hash=payload_hash,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return Response(status_code=204)


@app.post("/api/v1/twilio/calls/{call_id}/ended", status_code=204)
async def twilio_conversation_ended(call_id: UUID, request: Request) -> Response:
    settings = get_settings()
    form = await request.form()
    signature_valid = _valid_twilio_http_request(request, settings, form)
    provider_sid = str(form.get("CallSid", ""))
    if str(form.get("AccountSid", "")) != settings.twilio_account_sid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid AccountSid")
    call = await run_in_threadpool(_provider_call, call_id, provider_sid)
    if call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
    if not signature_valid and not await run_in_threadpool(
        _unsigned_trial_callback_allowed, call_id, provider_sid, settings
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Invalid Twilio signature"
        )
    session_status = str(form.get("SessionStatus", "ended"))
    if session_status not in {"ended", "failed"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid SessionStatus")
    if session_status == "failed":
        await run_in_threadpool(
            _fail_twilio_session,
            call_id=call_id,
            provider_call_sid=provider_sid,
            session_status=session_status,
            error_code=str(form.get("ErrorCode", ""))[:32],
        )
    elif call.state not in {"completed", "failed", "blocked"}:
        context = VoiceCallContext(
            call_id=call.id,
            organization_id=call.organization_id,
            transport=call.transport,
            max_duration_seconds=call.max_duration_seconds,
            started_at=call.started_at or datetime.now(UTC),
        )
        outcome = "provider_session_ended"
        handoff_data = str(form.get("HandoffData", ""))
        if handoff_data:
            with suppress(AttributeError, json.JSONDecodeError, TypeError):
                requested = json.loads(handoff_data).get("outcome")
                if requested in {
                    "completed",
                    "handoff_requested",
                    "participant_opted_out",
                    "wrong_person",
                    "permission_denied",
                    "silence_limit_reached",
                    "stop_requested",
                    "max_duration_reached",
                }:
                    outcome = requested
        await run_in_threadpool(_complete_call, context, outcome)
    return Response(status_code=204)


@app.websocket("/api/v1/voice/stream")
async def voice_stream(websocket: WebSocket, language_code: str = "auto") -> None:
    settings = get_settings()
    try:
        await run_in_threadpool(
            _authenticate_cookie, websocket.cookies.get("sales_agent_session"), settings
        )
    except HTTPException as exc:
        await websocket.close(code=4401 if exc.status_code == 401 else 4403)
        return
    await websocket.accept()
    if not settings.sarvam_api_key:
        await websocket.send_json(
            {
                "event": "error",
                "code": "provider_not_configured",
                "message": "Sarvam is not configured",
            }
        )
        await websocket.close(code=1011)
        return
    try:
        await bridge_realtime(
            websocket, api_key=settings.sarvam_api_key, language_code=language_code
        )
    except WebSocketDisconnect:
        return
    except Exception:
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.send_json(
                {
                    "event": "error",
                    "code": "provider_unavailable",
                    "message": "Speech provider unavailable",
                }
            )
            await websocket.close(code=1011, reason="speech provider unavailable")


@app.websocket("/api/v1/twilio/conversation/{call_id}")
async def twilio_conversation_session(websocket: WebSocket, call_id: UUID) -> None:
    settings = get_settings()
    expected_url = public_websocket_url(
        settings, f"/api/v1/twilio/conversation/{call_id}"
    )
    signature_valid = validate_twilio_request(
        settings,
        url=expected_url,
        params={},
        signature=websocket.headers.get("X-Twilio-Signature"),
    )
    if not signature_valid and settings.app_env not in {"development", "test"}:
        await websocket.close(code=4403, reason="invalid Twilio signature")
        return
    await websocket.accept()
    context: VoiceCallContext | None = None
    outcome = "provider_disconnected"
    began = monotonic()
    try:
        setup = await asyncio.wait_for(websocket.receive_json(), timeout=10.0)
        if not isinstance(setup, dict) or setup.get("type") != "setup":
            raise ValueError("ConversationRelay setup message required")
        provider_sid = str(setup.get("callSid", ""))
        custom = setup.get("customParameters") or {}
        if (
            not isinstance(custom, dict)
            or not provider_sid
            or str(setup.get("accountSid", "")) != settings.twilio_account_sid
            or str(custom.get("localCallId", "")) != str(call_id)
        ):
            raise PermissionError("ConversationRelay setup does not match the call")
        if not signature_valid and not await run_in_threadpool(
            _unsigned_trial_callback_allowed, call_id, provider_sid, settings
        ):
            raise PermissionError("Unsigned trial callback does not match the call")
        context = await run_in_threadpool(_start_provider_call, call_id, provider_sid, settings)
        conversation = await run_in_threadpool(
            _create_conversation, context, settings.twilio_conversation_language
        )
        sequence = await run_in_threadpool(_next_transcript_sequence, context)
        while True:
            elapsed_ms = round((monotonic() - began) * 1000)
            if elapsed_ms >= context.max_duration_seconds * 1000:
                outcome = "max_duration_reached"
                await websocket.send_json(
                    {
                        "type": "end",
                        "handoffData": json.dumps({"outcome": outcome}),
                    }
                )
                break
            if await run_in_threadpool(_should_stop, context, settings):
                outcome = "stop_requested"
                await websocket.send_json(
                    {
                        "type": "end",
                        "handoffData": json.dumps({"outcome": outcome}),
                    }
                )
                break
            try:
                message = await asyncio.wait_for(websocket.receive_json(), timeout=1.0)
            except TimeoutError:
                continue
            if not isinstance(message, dict):
                raise ValueError("ConversationRelay message must be an object")
            message_type = message.get("type")
            if message_type == "prompt" and message.get("last") is True:
                text = " ".join(str(message.get("voicePrompt", "")).split())
                if not text:
                    continue
                response_time = min(elapsed_ms, context.max_duration_seconds * 1000)
                await run_in_threadpool(
                    _record_segment,
                    context,
                    sequence,
                    "participant",
                    text,
                    settings.twilio_conversation_language,
                    response_time,
                    response_time,
                )
                reply = await run_in_threadpool(_handle_turn, conversation, text)
                await run_in_threadpool(
                    _record_segment,
                    context,
                    sequence + 1,
                    "agent",
                    reply.text,
                    settings.twilio_conversation_language,
                    response_time,
                    response_time,
                )
                sequence += 2
                await websocket.send_json(
                    {
                        "type": "text",
                        "token": reply.text,
                        "last": True,
                        "interruptible": True,
                        "preemptible": True,
                    }
                )
                if reply.end_call:
                    outcome = reply.outcome or "completed"
                    await websocket.send_json(
                        {
                            "type": "end",
                            "handoffData": json.dumps({"outcome": outcome}),
                        }
                    )
                    break
            elif message_type == "error":
                # ConversationRelay reports recoverable validation/TTS warnings with this
                # message type too. Twilio closes the socket itself for terminal errors.
                outcome = "provider_error"
                continue
            elif message_type in {"interrupt", "dtmf", "prompt"}:
                continue
            else:
                raise ValueError("Unsupported ConversationRelay message")
    except (WebSocketDisconnect, TimeoutError):
        pass
    except (PermissionError, ValueError):
        outcome = "invalid_provider_message"
        if websocket.application_state == WebSocketState.CONNECTED:
            with suppress(Exception):
                await websocket.close(code=1008, reason="invalid provider message")
    finally:
        if context is not None and outcome not in {
            "provider_disconnected",
            "provider_error",
            "invalid_provider_message",
        }:
            await run_in_threadpool(_complete_call, context, outcome)
        if websocket.application_state == WebSocketState.CONNECTED:
            with suppress(Exception):
                await websocket.close(code=1000, reason="conversation complete")


@app.websocket("/api/v1/voice/calls/{call_id}")
async def browser_call_session(
    websocket: WebSocket,
    call_id: UUID,
    language_code: Literal["en-IN", "hi-IN"] = "en-IN",
) -> None:
    settings = get_settings()
    try:
        auth = await run_in_threadpool(
            _authenticate_cookie, websocket.cookies.get("sales_agent_session"), settings
        )
        context = await run_in_threadpool(_start_voice_call, call_id, auth, settings)
    except HTTPException as exc:
        await websocket.close(code=4401 if exc.status_code == 401 else 4403)
        return
    except LookupError:
        await websocket.close(code=4404, reason="call not found")
        return
    except PermissionError as exc:
        await websocket.close(code=4409, reason=str(exc))
        return

    await websocket.accept()
    began = monotonic()
    outcome = "client_disconnected"
    pending_outcome: str | None = None
    playback_active = False
    try:
        conversation = await run_in_threadpool(_create_conversation, context, language_code)
    except ValueError:
        await run_in_threadpool(_complete_call, context, "approved_context_unavailable")
        await websocket.send_json(
            {
                "event": "error",
                "code": "approved_context_unavailable",
                "message": "Approved conversation context is unavailable",
            }
        )
        await websocket.close(code=1011, reason="approved conversation context unavailable")
        return
    greeting = conversation.disclosure
    await run_in_threadpool(
        _record_segment, context, 0, "agent", greeting, language_code, 0, 0
    )
    await websocket.send_json(
        {
            "event": "session.started",
            "state": "active",
            "max_duration_seconds": context.max_duration_seconds,
            "conversation_policy_version": CONVERSATION_POLICY_VERSION,
            "dialogue_mode": (
                conversation.dialogue_adapter.mode
                if conversation.dialogue_adapter is not None
                else "deterministic"
            ),
        }
    )
    await websocket.send_json(
        {"event": "agent.response", "state": "speaking", "text": greeting, "sequence": 0}
    )
    try:
        while True:
            elapsed_ms = round((monotonic() - began) * 1000)
            if elapsed_ms >= context.max_duration_seconds * 1000:
                outcome = "max_duration_reached"
                await websocket.send_json({"event": "session.ending", "reason": outcome})
                break
            if await run_in_threadpool(_should_stop, context, settings):
                outcome = "stop_requested"
                await websocket.send_json({"event": "session.ending", "reason": outcome})
                break
            try:
                payload = await asyncio.wait_for(websocket.receive_json(), timeout=1.0)
            except TimeoutError:
                continue
            message = parse_browser_voice_message(payload)
            if message.event == "ping":
                await websocket.send_json({"event": "pong"})
            elif message.event == "speech.start":
                if playback_active:
                    await websocket.send_json(
                        {"event": "playback.cancel", "state": "interrupted"}
                    )
                playback_active = False
                await websocket.send_json({"event": "state.changed", "state": "listening"})
            elif message.event == "speech.end":
                await websocket.send_json({"event": "state.changed", "state": "thinking"})
            elif message.event == "transcript.partial":
                await websocket.send_json(
                    {"event": "transcript.partial", "text": message.text, "state": "listening"}
                )
            elif message.event == "transcript.final":
                if pending_outcome:
                    outcome = pending_outcome
                    await websocket.send_json({"event": "session.ending", "reason": outcome})
                    break
                assert message.sequence is not None
                assert message.text is not None
                assert message.language is not None
                assert message.started_ms is not None
                assert message.ended_ms is not None
                await run_in_threadpool(
                    _record_segment,
                    context,
                    message.sequence,
                    "participant",
                    message.text,
                    message.language,
                    message.started_ms,
                    message.ended_ms,
                )
                await websocket.send_json(
                    {"event": "transcript.final", "text": message.text, "state": "thinking"}
                )
                reply = await run_in_threadpool(_handle_turn, conversation, message.text)
                response_text = reply.text
                response_sequence = message.sequence + 1
                response_time = min(elapsed_ms, context.max_duration_seconds * 1000)
                await run_in_threadpool(
                    _record_segment,
                    context,
                    response_sequence,
                    "agent",
                    response_text,
                    message.language,
                    response_time,
                    response_time,
                )
                playback_active = True
                await websocket.send_json(
                    {
                        "event": "agent.response",
                        "state": "speaking",
                        "text": response_text,
                        "sequence": response_sequence,
                        "conversation_state": reply.state.value,
                        "tools": list(reply.tools),
                    }
                )
                if reply.end_call:
                    pending_outcome = reply.outcome or "completed"
            elif message.event == "playback.started":
                playback_active = True
                if message.latency_ms is not None:
                    await run_in_threadpool(_record_latency, context, message.latency_ms)
                await websocket.send_json({"event": "state.changed", "state": "speaking"})
            elif message.event == "playback.ended":
                playback_active = False
                if pending_outcome:
                    outcome = pending_outcome
                    await websocket.send_json({"event": "session.ending", "reason": outcome})
                    break
                await websocket.send_json({"event": "state.changed", "state": "listening"})
            elif message.event == "silence":
                reply = conversation.handle_silence()
                pending_outcome = reply.outcome if reply.end_call else None
                await websocket.send_json(
                    {
                        "event": "agent.response",
                        "state": "speaking",
                        "text": reply.text,
                        "conversation_state": reply.state.value,
                    }
                )
            elif message.event == "end":
                outcome = "participant_ended"
                break
    except WebSocketDisconnect:
        outcome = "client_disconnected"
    except ValueError as exc:
        outcome = "invalid_client_message"
        if websocket.application_state == WebSocketState.CONNECTED:
            await websocket.send_json(
                {"event": "error", "code": "invalid_client_message", "message": str(exc)}
            )
    finally:
        await run_in_threadpool(_complete_call, context, outcome)
        if websocket.application_state == WebSocketState.CONNECTED:
            # A peer disconnect can arrive between the state check and either send.
            # Completion is already committed, so transport cleanup must never undo it.
            with suppress(Exception):
                await websocket.send_json({"event": "session.completed", "outcome": outcome})
            with suppress(Exception):
                await websocket.close(code=1000, reason="voice session complete")


@app.post("/api/v1/voice/tts")
async def text_to_speech(
    payload: TTSRequest,
    sales_agent_session: Annotated[str | None, Cookie()] = None,
) -> StreamingResponse:
    settings = get_settings()
    await run_in_threadpool(_authenticate_cookie, sales_agent_session, settings)
    if not settings.sarvam_api_key:
        raise HTTPException(status_code=503, detail="Sarvam is not configured")
    client, response, body = await sarvam_tts_stream(
        api_key=settings.sarvam_api_key,
        text=payload.text,
        language_code=payload.language_code,
    )
    if response.status_code != 200:
        await response.aread()
        await response.aclose()
        await client.aclose()
        if response.status_code == 402:
            raise HTTPException(status_code=402, detail="Sarvam account has no available credits")
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="Speech synthesis rate limit reached")
        raise HTTPException(
            status_code=502, detail="Speech synthesis provider rejected the request"
        )
    return StreamingResponse(body, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
