"""Module A endpoints — Sales Forecasting.

POST {prefix}/forecast        one product
POST {prefix}/forecast/batch  many products (dashboard / purchasing engine)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.security import require_api_key
from app.schemas.common import ApiResponse, ok
from app.schemas.forecasting import (
    BatchForecastRequest,
    BatchForecastResult,
    ForecastRequest,
    ForecastResult,
    ForecastStatus,
)
from app.services.forecasting_service import forecast_product

router = APIRouter(prefix="/forecast", tags=["forecasting"], dependencies=[Depends(require_api_key)])


@router.post("", response_model=ApiResponse[ForecastResult], summary="Forecast demand for one product")
def forecast_one(req: ForecastRequest) -> ApiResponse[ForecastResult]:
    """Predicts demand for the next `horizon_days` from the real sales history supplied.

    If there are fewer than 7 days of history, the response has `status = "insufficient_data"`
    and no prediction, rather than a guessed one.
    """
    return ok(forecast_product(req))


@router.post("/batch", response_model=ApiResponse[BatchForecastResult], summary="Forecast many products")
def forecast_batch(req: BatchForecastRequest) -> ApiResponse[BatchForecastResult]:
    """Batch-level `horizon_days` and `as_of_date` override the per-product values."""
    results = [
        forecast_product(
            p.model_copy(update={"horizon_days": req.horizon_days, "as_of_date": req.as_of_date or p.as_of_date})
        )
        for p in req.products
    ]
    ok_count = sum(1 for r in results if r.status == ForecastStatus.OK)
    return ok(
        BatchForecastResult(
            horizon_days=req.horizon_days,
            total_products=len(results),
            forecasted=ok_count,
            insufficient_data=len(results) - ok_count,
            results=results,
        )
    )
