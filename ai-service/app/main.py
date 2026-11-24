"""OptiSell AI Service — FastAPI entrypoint.

Run locally:  uvicorn app.main:app --reload --port 8001
Docs:         http://localhost:8001/docs
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import forecasting
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.schemas.common import ApiResponse, ok

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="OptiSell AI Service",
        version=settings.service_version,
        description="Forecasting, purchasing recommendations and business insights for OptiSell.",
        openapi_url=f"{settings.api_prefix}/openapi.json",
        docs_url="/docs",
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type", "X-API-Key"],
        )

    register_error_handlers(app)

    api = APIRouter(prefix=settings.api_prefix)

    @api.get("/health", response_model=ApiResponse[dict], tags=["system"])
    def health() -> ApiResponse[dict]:
        return ok({"status": "ok", "environment": settings.environment})

    api.include_router(forecasting.router)
    # Next modules plug in here:
    # api.include_router(recommendations.router)  # Module B
    # api.include_router(insights.router)         # Module C
    app.include_router(api)
    return app


app = create_app()
