"""Service-to-service API key check.

The AI service is called by the OptiSell backend, never directly by browsers.
The backend sends the shared secret in the `X-API-Key` header.
"""
from __future__ import annotations

import hmac

from fastapi import Header

from app.core.config import get_settings
from app.core.errors import ServiceError


async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    expected = get_settings().api_key
    if not expected:
        return  # auth disabled (local development only)
    if not x_api_key or not hmac.compare_digest(x_api_key, expected):
        raise ServiceError(
            code="UNAUTHORIZED",
            message="Missing or invalid X-API-Key header.",
            status_code=401,
        )
