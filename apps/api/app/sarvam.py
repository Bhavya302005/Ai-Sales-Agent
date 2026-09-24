import asyncio
import base64
import binascii
import json
from collections.abc import AsyncIterator
from contextlib import suppress
from typing import Any
from urllib.parse import urlencode

import httpx
import websockets
from fastapi import WebSocket, WebSocketDisconnect

SARVAM_STT_URL = "wss://api.sarvam.ai/speech-to-text-realtime/ws"
SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech/stream"
ALLOWED_LANGUAGES = {"auto", "en-IN", "hi-IN"}
MAX_AUDIO_CHUNK_BYTES = 32_000


def realtime_url(language_code: str) -> str:
    language = language_code if language_code in ALLOWED_LANGUAGES else "auto"
    query = urlencode(
        {
            "language_code": language,
            "model": "saaras:v3-realtime",
            "stream_type": "fast",
            "mode": "transcribe",
            "endpointing": "vad",
            "encoding": "linear16",
            "sample_rate": 16000,
            "silence_duration_ms": 500,
            "min_speech_duration_ms": 250,
        }
    )
    return f"{SARVAM_STT_URL}?{query}"


def validate_browser_message(message: dict[str, Any]) -> dict[str, str]:
    event = message.get("event")
    if event == "audio_input":
        audio = message.get("audio")
        if not isinstance(audio, str):
            raise ValueError("audio_input requires base64 audio")
        try:
            decoded = base64.b64decode(audio, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("audio_input contains invalid base64") from exc
        if not decoded or len(decoded) > MAX_AUDIO_CHUNK_BYTES:
            raise ValueError("audio_input chunk size is invalid")
        return {"event": "audio_input", "audio": audio}
    if event in {"end", "ping"}:
        return {"event": event}
    raise ValueError("unsupported voice event")


def provider_close(event: dict[str, Any]) -> tuple[int, str] | None:
    if event.get("event") == "session.end":
        return 1000, "provider session complete"
    if event.get("event") != "error" or not event.get("is_fatal"):
        return None
    if event.get("code") == "quota_exceeded" or event.get("status_code") == 402:
        return 4002, "provider credits exhausted"
    return 1011, "provider session failed"


async def bridge_realtime(websocket: WebSocket, *, api_key: str, language_code: str) -> None:
    async with websockets.connect(
        realtime_url(language_code),
        additional_headers={"Api-Subscription-Key": api_key},
        max_size=1_048_576,
        ping_interval=20,
        ping_timeout=20,
    ) as provider:

        async def browser_to_provider() -> None:
            while True:
                try:
                    message = await websocket.receive_json()
                except WebSocketDisconnect:
                    with suppress(Exception):
                        await provider.send(json.dumps({"event": "end"}))
                    return
                try:
                    outbound = validate_browser_message(message)
                except ValueError as exc:
                    await websocket.send_json(
                        {"event": "error", "code": "invalid_client_message", "message": str(exc)}
                    )
                    continue
                await provider.send(json.dumps(outbound))
                if outbound["event"] == "end":
                    return

        async def provider_to_browser() -> None:
            async for raw in provider:
                if isinstance(raw, bytes):
                    continue
                try:
                    event = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                await websocket.send_json(event)
                close = provider_close(event)
                if close is not None:
                    await websocket.close(code=close[0], reason=close[1])
                    return
            await websocket.close(code=1011, reason="provider connection ended unexpectedly")

        tasks = {
            asyncio.create_task(browser_to_provider()),
            asyncio.create_task(provider_to_browser()),
        }
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in pending:
            with suppress(asyncio.CancelledError):
                await task
        for task in done:
            await task


async def sarvam_tts_stream(
    *, api_key: str, text: str, language_code: str
) -> tuple[httpx.AsyncClient, httpx.Response, AsyncIterator[bytes]]:
    client = httpx.AsyncClient(timeout=httpx.Timeout(30, connect=10))
    request = client.build_request(
        "POST",
        SARVAM_TTS_URL,
        headers={"Api-Subscription-Key": api_key, "Accept": "audio/mpeg"},
        json={
            "text": text,
            "language_code": language_code,
            "speaker": "shubh",
            "model": "bulbul:v3",
            "output_audio_codec": "mp3",
            "output_audio_bitrate": "64k",
            "enable_preprocessing": True,
        },
    )
    response = await client.send(request, stream=True)

    async def body() -> AsyncIterator[bytes]:
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return client, response, body()
