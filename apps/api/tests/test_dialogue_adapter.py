import json

import httpx

from app.config import Settings
from app.conversation.dialogue_adapter import (
    AnthropicDialogueAdapter,
    GeminiDialogueAdapter,
    build_dialogue_adapter,
)


def test_anthropic_adapter_returns_bounded_structured_interpretation() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://api.anthropic.com/v1/messages"
        assert request.headers["x-api-key"] == "test-key"
        body = json.loads(request.content)
        assert body["model"] == "claude-haiku-4-5-20251001"
        assert "participant_text" in body["messages"][0]["content"]
        return httpx.Response(
            200,
            json={
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(
                            {
                                "confirmation": "yes",
                                "acknowledgement": (
                                    "That sounds like a practical migration priority."
                                ),
                                "faq_key": None,
                            }
                        ),
                    }
                ]
            },
        )

    adapter = AnthropicDialogueAdapter(
        api_key="test-key",
        model="claude-haiku-4-5-20251001",
        timeout_seconds=2,
        transport=httpx.MockTransport(handler),
    )

    result = adapter.interpret(
        participant_text="I don't see why we shouldn't continue.",
        language="en-IN",
        conversation_state="Permission",
        current_question="Is now a good time?",
        approved_facts={"deployment": "Hybrid is supported."},
    )

    assert result is not None
    assert result.confirmation == "yes"
    assert result.acknowledgement == "That sounds like a practical migration priority."
    assert result.faq_key is None


def test_anthropic_adapter_fails_closed_to_deterministic_fallback() -> None:
    adapter = AnthropicDialogueAdapter(
        api_key="test-key",
        model="claude-haiku-4-5-20251001",
        timeout_seconds=2,
        transport=httpx.MockTransport(lambda _request: httpx.Response(429)),
    )

    assert adapter.interpret(
        participant_text="Continue",
        language="en-IN",
        conversation_state="Permission",
        current_question="Is now a good time?",
        approved_facts={},
    ) is None


def test_gemini_adapter_uses_structured_output_without_exposing_key_in_url() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            "gemini-3.5-flash-lite:generateContent"
        )
        assert request.url.query == b""
        assert request.headers["x-goog-api-key"] == "gemini-test-key"
        body = json.loads(request.content)
        assert body["generationConfig"]["responseMimeType"] == "application/json"
        assert body["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "minimal"}
        assert body["generationConfig"]["responseJsonSchema"]["additionalProperties"] is False
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {
                                            "confirmation": "yes",
                                            "acknowledgement": (
                                                "Understood, that is a clear priority."
                                            ),
                                            "faq_key": "security",
                                        }
                                    )
                                }
                            ]
                        }
                    }
                ]
            },
        )

    adapter = GeminiDialogueAdapter(
        api_key="gemini-test-key",
        model="gemini-3.5-flash-lite",
        timeout_seconds=2,
        transport=httpx.MockTransport(handler),
    )

    result = adapter.interpret(
        participant_text="That works. What security controls do you support?",
        language="en-IN",
        conversation_state="Qualification",
        current_question="Which workloads are in scope?",
        approved_facts={"security": "Approved security fact."},
    )

    assert result is not None
    assert result.confirmation == "yes"
    assert result.faq_key == "security"


def test_gemini_adapter_seamlessly_replays_same_context_on_fallback_key() -> None:
    seen_keys: list[str] = []
    seen_requests: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_keys.append(request.headers["x-goog-api-key"])
        seen_requests.append(json.loads(request.content))
        if request.headers["x-goog-api-key"] == "primary-key":
            return httpx.Response(429, json={"error": {"status": "RESOURCE_EXHAUSTED"}})
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": json.dumps(
                                        {
                                            "confirmation": "unclear",
                                            "acknowledgement": "That timeline is helpful.",
                                            "faq_key": None,
                                        }
                                    )
                                }
                            ]
                        }
                    }
                ]
            },
        )

    adapter = GeminiDialogueAdapter(
        api_key="primary-key",
        fallback_api_key="fallback-key",
        model="gemini-3.5-flash-lite",
        timeout_seconds=2,
        transport=httpx.MockTransport(handler),
    )

    result = adapter.interpret(
        participant_text="We need this before December.",
        language="en-IN",
        conversation_state="Qualification",
        current_question="What deadline is driving this?",
        approved_facts={},
        previous_participant_answers=("Finance and inventory are in scope.",),
    )

    assert result is not None
    assert result.acknowledgement == "That timeline is helpful."
    assert seen_keys == ["primary-key", "fallback-key"]
    assert seen_requests[0] == seen_requests[1]
    request_text = seen_requests[1]["contents"][0]["parts"][0]["text"]  # type: ignore[index]
    assert "Finance and inventory are in scope." in str(request_text)


def test_dialogue_adapter_is_enabled_only_with_explicit_mode_and_key() -> None:
    fallback = Settings(app_env="test", dialogue_mode="deterministic")
    enabled = Settings(
        app_env="test",
        dialogue_mode="anthropic",
        anthropic_api_key="test-key",
    )
    gemini = Settings(
        app_env="test",
        dialogue_mode="gemini",
        gemini_api_key="test-key",
        gemini_fallback_api_key="fallback-test-key",
    )

    assert build_dialogue_adapter(fallback) is None
    assert isinstance(build_dialogue_adapter(enabled), AnthropicDialogueAdapter)
    assert isinstance(build_dialogue_adapter(gemini), GeminiDialogueAdapter)
