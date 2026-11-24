"""Request/response schemas for Module A — Sales Forecasting."""
from __future__ import annotations

from datetime import date
from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.config import get_settings


# ---------- Request ----------

class SalesRecord(BaseModel):
    """One day of sales for one product. Multiple records on the same date are summed."""
    date: date
    quantity: float = Field(ge=0, description="Units sold (net of returns, never negative).")


class ForecastRequest(BaseModel):
    product_id: str = Field(min_length=1, max_length=64)
    product_name: str = Field(min_length=1, max_length=255)
    sales_history: list[SalesRecord] = Field(
        default_factory=list,
        description="Real recorded daily sales from the OptiSell database. Never synthetic.",
    )
    horizon_days: int = Field(default=7, ge=1)
    as_of_date: date | None = Field(
        default=None,
        description=(
            "Date the forecast is made from (usually today). Days between the last sales "
            "record and this date count as zero-sale days. Defaults to the last record date."
        ),
    )

    @field_validator("horizon_days")
    @classmethod
    def _horizon_limit(cls, v: int) -> int:
        limit = get_settings().max_horizon_days
        if v > limit:
            raise ValueError(f"horizon_days must be <= {limit}")
        return v

    @model_validator(mode="after")
    def _check_dates(self) -> "ForecastRequest":
        if self.sales_history:
            dates = [r.date for r in self.sales_history]
            span = (max(dates) - min(dates)).days + 1
            limit = get_settings().max_history_days
            if span > limit:
                raise ValueError(f"sales_history spans {span} days; maximum is {limit}")
            if self.as_of_date and max(dates) > self.as_of_date:
                raise ValueError("sales_history contains dates after as_of_date")
        return self


class BatchForecastRequest(BaseModel):
    horizon_days: int = Field(default=7, ge=1)
    as_of_date: date | None = None
    products: list[ForecastRequest] = Field(min_length=1)

    @model_validator(mode="after")
    def _limits(self) -> "BatchForecastRequest":
        s = get_settings()
        if len(self.products) > s.max_batch_size:
            raise ValueError(f"at most {s.max_batch_size} products per batch")
        if self.horizon_days > s.max_horizon_days:
            raise ValueError(f"horizon_days must be <= {s.max_horizon_days}")
        if self.as_of_date:
            for p in self.products:
                if p.sales_history and max(r.date for r in p.sales_history) > self.as_of_date:
                    raise ValueError(f"product {p.product_id}: sales_history has dates after as_of_date")
        return self


# ---------- Response ----------

class ForecastStatus(str, Enum):
    OK = "ok"
    INSUFFICIENT_DATA = "insufficient_data"


class TrendDirection(str, Enum):
    INCREASING = "increasing"
    DECREASING = "decreasing"
    STABLE = "stable"
    UNKNOWN = "unknown"  # not enough history to judge


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"  # no forecast produced


class DailyForecast(BaseModel):
    date: date
    predicted_quantity: float


class PredictionInterval(BaseModel):
    lower: float
    upper: float
    level: float = Field(description="Coverage, e.g. 0.8 = 80% interval.")


class Trend(BaseModel):
    direction: TrendDirection
    change_pct: float | None = Field(
        description="Recent window average vs previous window average, in percent."
    )
    window_days: int | None = Field(description="Length of each comparison window.")


class Confidence(BaseModel):
    level: ConfidenceLevel
    reasons: list[str]


class DataQuality(BaseModel):
    history_days: int = Field(description="Calendar days covered, first record to as_of_date.")
    days_with_sales: int
    days_without_records: int = Field(description="Days with no record, treated as zero sales.")
    first_date: date | None
    last_date: date | None
    total_units_sold: float


class ForecastResult(BaseModel):
    product_id: str
    product_name: str
    status: ForecastStatus
    is_demo: bool = Field(
        default=False,
        description="Always false: results are computed only from the real history supplied.",
    )
    method: str | None
    horizon_days: int
    forecast_start: date | None
    forecast_end: date | None
    historical_avg_daily_sales: float | None
    predicted_demand: float | None = Field(description="Total predicted units over the horizon.")
    predicted_demand_units: int | None = Field(description="predicted_demand rounded to whole units.")
    prediction_interval: PredictionInterval | None
    daily_forecast: list[DailyForecast]
    trend: Trend
    confidence: Confidence
    data_quality: DataQuality
    explanation: str


class BatchForecastResult(BaseModel):
    horizon_days: int
    total_products: int
    forecasted: int
    insufficient_data: int
    results: list[ForecastResult]
