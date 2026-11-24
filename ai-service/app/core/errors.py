"""Error handling: every error leaves the service in the standard envelope."""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.common import ErrorDetail, build_meta

logger = logging.getLogger("optisell.ai")


class ServiceError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, details=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


def _error_response(status_code: int, code: str, message: str, details=None) -> JSONResponse:
    body = {
        "success": False,
        "data": None,
        "error": ErrorDetail(code=code, message=message, details=details).model_dump(mode="json"),
        "meta": build_meta().model_dump(mode="json"),
    }
    return JSONResponse(status_code=status_code, content=body)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ServiceError)
    async def _service_error(_: Request, exc: ServiceError):
        return _error_response(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        details = [
            {"field": ".".join(str(p) for p in err["loc"] if p != "body"), "message": err["msg"]}
            for err in exc.errors()
        ]
        return _error_response(422, "VALIDATION_ERROR", "Request body is invalid.", details)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException):
        code = "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
        return _error_response(exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        logger.exception("Unhandled error: %s", exc)
        return _error_response(500, "INTERNAL_ERROR", "Unexpected error in AI service.")
