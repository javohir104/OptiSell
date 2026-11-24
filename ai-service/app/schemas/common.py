"""Standard response envelope shared by every AI endpoint.

Success:  {"success": true,  "data": {...}, "error": null,  "meta": {...}}
Failure:  {"success": false, "data": null,  "error": {...}, "meta": {...}}
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

from app.core.config import get_settings

T = TypeVar("T")


class ErrorDetail(BaseModel):
    code: str = Field(description="Machine-readable error code, e.g. VALIDATION_ERROR.")
    message: str
    details: Any | None = None


class Meta(BaseModel):
    request_id: str
    generated_at: datetime
    service: str
    service_version: str


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    error: ErrorDetail | None = None
    meta: Meta


def build_meta() -> Meta:
    s = get_settings()
    return Meta(
        request_id=str(uuid.uuid4()),
        generated_at=datetime.now(timezone.utc),
        service=s.service_name,
        service_version=s.service_version,
    )


def ok(data: T) -> ApiResponse[T]:
    return ApiResponse[T](success=True, data=data, error=None, meta=build_meta())
