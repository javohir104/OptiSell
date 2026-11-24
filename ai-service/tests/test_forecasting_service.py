from __future__ import annotations

from datetime import date

from app.schemas.forecasting import (
    ConfidenceLevel,
    ForecastRequest,
    ForecastStatus,
    TrendDirection,
)
from app.services.forecasting_service import (
    METHOD_HOLT,
    METHOD_HOLT_SEASONAL,
    METHOD_MOVING_AVERAGE,
    build_daily_series,
    detect_trend,
    forecast_product,
)
from tests.conftest import make_history


def _req(values, **kw) -> ForecastRequest:
    return ForecastRequest(
        product_id="p1", product_name="Coca-Cola 1L", sales_history=make_history(values), **kw
    )


# ---- missing / insufficient data ----

def test_empty_history_returns_insufficient_data_without_prediction():
    r = forecast_product(_req([]))
    assert r.status == ForecastStatus.INSUFFICIENT_DATA
    assert r.predicted_demand is None and r.daily_forecast == []
    assert r.confidence.level == ConfidenceLevel.NONE
    assert r.is_demo is False


def test_under_seven_days_is_insufficient():
    r = forecast_product(_req([5, 6, 4]))
    assert r.status == ForecastStatus.INSUFFICIENT_DATA
    assert r.historical_avg_daily_sales == 5.0  # real observed data is still reported
    assert "3 day(s)" in r.explanation


def test_gaps_are_filled_with_zero_and_reported():
    history = [{"date": "2026-01-01", "quantity": 4}, {"date": "2026-01-05", "quantity": 6},
               {"date": "2026-01-05", "quantity": 2}]
    s = build_daily_series(ForecastRequest(product_id="p", product_name="x", sales_history=history).sales_history, None)
    assert s.values == [4, 0, 0, 0, 8]
    assert s.days_without_records == 3


def test_as_of_date_extends_series_with_zero_days():
    r = forecast_product(_req([10] * 10, as_of_date=date(2026, 1, 15)))
    assert r.data_quality.history_days == 15
    assert r.data_quality.days_without_records == 5
    assert str(r.forecast_start) == "2026-01-16"


# ---- methods ----

def test_short_history_uses_moving_average():
    r = forecast_product(_req([10] * 10, horizon_days=7))
    assert r.method == METHOD_MOVING_AVERAGE
    assert r.predicted_demand_units == 70
    assert r.trend.direction == TrendDirection.UNKNOWN


def test_constant_sales_forecast_is_flat_and_stable():
    r = forecast_product(_req([15] * 60, horizon_days=7))
    assert r.status == ForecastStatus.OK
    assert r.method in (METHOD_HOLT, METHOD_HOLT_SEASONAL)
    assert r.predicted_demand_units == 105
    assert r.trend.direction == TrendDirection.STABLE
    assert r.confidence.level == ConfidenceLevel.HIGH


def test_weekly_pattern_is_captured():
    week = [10, 10, 10, 10, 10, 30, 30]  # weekend spike
    r = forecast_product(_req(week * 8, horizon_days=7))
    assert r.method == METHOD_HOLT_SEASONAL
    assert 100 <= r.predicted_demand <= 120  # true weekly total = 5*10 + 2*30 = 110
    high_days = [d for d in r.daily_forecast if d.predicted_quantity > 20]
    assert len(high_days) == 2  # the two spike weekdays stay high


def test_never_negative():
    values = [50 - i for i in range(50)]  # falling to ~1/day
    r = forecast_product(_req(values, horizon_days=30))
    assert all(d.predicted_quantity >= 0 for d in r.daily_forecast)
    assert r.prediction_interval.lower >= 0


def test_all_zero_sales_predicts_zero_with_low_confidence():
    r = forecast_product(_req([0] * 30))
    assert r.predicted_demand == 0
    assert r.confidence.level == ConfidenceLevel.LOW


# ---- trend ----

def test_increasing_trend_detected():
    t = detect_trend([10] * 14 + [14] * 14)
    assert t.direction == TrendDirection.INCREASING and t.change_pct == 40.0


def test_decreasing_trend_detected():
    t = detect_trend([20] * 14 + [10] * 14)
    assert t.direction == TrendDirection.DECREASING and t.change_pct == -50.0


def test_new_demand_from_zero_is_increasing():
    t = detect_trend([0] * 14 + [5] * 14)
    assert t.direction == TrendDirection.INCREASING and t.change_pct is None


def test_rising_sales_forecast_above_average():
    values = [10 + i * 0.5 for i in range(60)]  # 10 -> 39.5
    r = forecast_product(_req(values, horizon_days=7))
    assert r.trend.direction == TrendDirection.INCREASING
    assert r.predicted_demand / 7 > r.historical_avg_daily_sales


def test_explanation_mentions_key_facts():
    r = forecast_product(_req([15] * 60))
    for fragment in ("Coca-Cola 1L", "15 units per day", "next 7 days", "Confidence"):
        assert fragment in r.explanation
