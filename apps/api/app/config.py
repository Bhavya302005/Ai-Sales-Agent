from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "staging", "production"] = "development"
    database_url: str = "postgresql+psycopg://sales_agent:sales_agent@localhost:5432/sales_agent"
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672//"
    discovery_mode: Literal["fixture", "live"] = "fixture"
    exa_discovery_mode: Literal["disabled", "mcp"] = "disabled"
    exa_discovery_timeout_seconds: int = Field(default=25, ge=5, le=60)
    source_allowed_hosts: str = ""
    source_max_bytes: int = Field(default=1_000_000, ge=10_000, le=5_000_000)
    voice_transport: Literal["browser", "twilio", "exotel"] = "browser"
    crm_mode: Literal["mock", "hubspot"] = "mock"
    async_mode: Literal["inline", "celery"] = "inline"
    record_audio: bool = False
    enable_outbound_pstn: bool = False
    calls_kill_switch: bool = False
    max_call_seconds: int = Field(default=300, ge=30, le=900)
    call_window_start_hour: int = Field(default=8, ge=0, le=23)
    call_window_end_hour: int = Field(default=21, ge=1, le=24)
    max_concurrent_calls: int = Field(default=1, ge=1, le=20)
    estimated_browser_call_cost_inr: int = Field(default=5, ge=0, le=10_000)
    estimated_pstn_call_cost_inr: int = Field(default=15, ge=0, le=10_000)
    daily_spend_limit_inr: int = Field(default=500, ge=0)
    transcript_retention_days: int = Field(default=30, ge=1, le=365)
    jwt_issuer: str = "ai-sales-agent-local"
    jwt_audience: str = "ai-sales-agent-web"
    jwt_secret: SecretStr = SecretStr("local-development-secret-change-me-now")
    sarvam_api_key: str | None = None
    dialogue_mode: Literal["deterministic", "anthropic", "gemini"] = "deterministic"
    gemini_api_key: SecretStr | None = None
    gemini_fallback_api_key: SecretStr | None = None
    gemini_dialogue_model: str = "gemini-3.5-flash-lite"
    anthropic_api_key: SecretStr | None = None
    anthropic_dialogue_model: str = "claude-haiku-4-5-20251001"
    dialogue_timeout_seconds: float = Field(default=4.0, ge=1.0, le=15.0)
    public_voice_base_url: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: SecretStr | None = None
    twilio_from_number: SecretStr | None = None
    twilio_test_to_number: SecretStr | None = None
    twilio_conversation_language: Literal["en-IN", "hi-IN"] = "en-IN"
    hubspot_access_token: str | None = None
    hubspot_api_version: Literal["2026-03"] = "2026-03"

    @model_validator(mode="after")
    def validate_selected_modes(self) -> "Settings":
        if self.discovery_mode == "live" and not self.source_allowed_hosts.strip():
            raise ValueError("DISCOVERY_MODE=live requires SOURCE_ALLOWED_HOSTS")
        if self.voice_transport in {"twilio", "exotel"} and not self.enable_outbound_pstn:
            raise ValueError("PSTN transport requires ENABLE_OUTBOUND_PSTN=true")
        if self.voice_transport == "twilio":
            required = {
                "PUBLIC_VOICE_BASE_URL": self.public_voice_base_url,
                "TWILIO_ACCOUNT_SID": self.twilio_account_sid,
                "TWILIO_AUTH_TOKEN": self.twilio_auth_token,
                "TWILIO_FROM_NUMBER": self.twilio_from_number,
                "TWILIO_TEST_TO_NUMBER": self.twilio_test_to_number,
            }
            missing = [name for name, value in required.items() if not value]
            if missing:
                raise ValueError(f"Twilio transport requires {', '.join(missing)}")
            if not str(self.public_voice_base_url).startswith("https://"):
                raise ValueError("PUBLIC_VOICE_BASE_URL must use HTTPS for Twilio")
            parsed_voice_url = urlparse(str(self.public_voice_base_url))
            if (
                parsed_voice_url.scheme != "https"
                or not parsed_voice_url.hostname
                or parsed_voice_url.username
                or parsed_voice_url.password
                or parsed_voice_url.path not in {"", "/"}
                or parsed_voice_url.params
                or parsed_voice_url.query
                or parsed_voice_url.fragment
            ):
                raise ValueError("PUBLIC_VOICE_BASE_URL must be an HTTPS origin without a path")
        if self.crm_mode == "hubspot" and not self.hubspot_access_token:
            raise ValueError("CRM_MODE=hubspot requires HUBSPOT_ACCESS_TOKEN")
        if self.dialogue_mode == "anthropic" and not self.anthropic_api_key:
            raise ValueError("DIALOGUE_MODE=anthropic requires ANTHROPIC_API_KEY")
        if self.dialogue_mode == "gemini" and not self.gemini_api_key:
            raise ValueError("DIALOGUE_MODE=gemini requires GEMINI_API_KEY")
        if self.call_window_start_hour >= self.call_window_end_hour:
            raise ValueError("CALL_WINDOW_START_HOUR must be before CALL_WINDOW_END_HOUR")
        is_live_environment = self.app_env in {"staging", "production"}
        uses_default_secret = self.jwt_secret.get_secret_value().startswith("local-development")
        if is_live_environment and uses_default_secret:
            raise ValueError("staging/production requires a non-default JWT_SECRET")
        return self

    @property
    def allowed_source_hosts(self) -> set[str]:
        return {
            host.strip().lower().rstrip(".")
            for host in self.source_allowed_hosts.split(",")
            if host.strip()
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
