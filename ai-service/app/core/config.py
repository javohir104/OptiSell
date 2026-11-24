"""Service configuration, read from environment variables (see .env.example)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache


def _split_csv(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


@dataclass(frozen=True)
class Settings:
    service_name: str = "optisell-ai-service"
    service_version: str = "0.1.0"
    environment: str = "development"
    api_prefix: str = "/api/v1/ai"
    # Shared secret for service-to-service calls (main backend -> AI service).
    # Empty means auth is disabled (only acceptable for local development).
    api_key: str = ""
    cors_origins: list[str] = field(default_factory=list)
    max_history_days: int = 730
    max_batch_size: int = 200
    max_horizon_days: int = 90


@lru_cache
def get_settings() -> Settings:
    return Settings(
        environment=os.getenv("OPTISELL_AI_ENV", "development"),
        api_key=os.getenv("OPTISELL_AI_API_KEY", ""),
        cors_origins=_split_csv(os.getenv("OPTISELL_AI_CORS_ORIGINS", "")),
        max_history_days=int(os.getenv("OPTISELL_AI_MAX_HISTORY_DAYS", "730")),
        max_batch_size=int(os.getenv("OPTISELL_AI_MAX_BATCH_SIZE", "200")),
        max_horizon_days=int(os.getenv("OPTISELL_AI_MAX_HORIZON_DAYS", "90")),
    )
