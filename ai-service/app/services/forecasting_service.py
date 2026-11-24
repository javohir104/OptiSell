"""Module A — Sales forecasting engine.

MVP design goals: works on small SMB datasets, has no heavy ML dependencies, can be
explained to a shop owner, and never invents data.

Pipeline for one product:
  1. Build a continuous daily series from the real sales records. Days with no record
     count as zero sales (a sales log has no row when nothing was sold), and the
     response reports how many such days there were.
  2. Choose a method based on how much history exists:
       < 7 days    -> no forecast (status = insufficient_data)
       7-13 days   -> moving average (no trend, low confidence)
       >= 14 days  -> damped-trend exponential smoothing (Holt)
       >= 28 days  -> plus day-of-week seasonality
  3. Detect trend: average of the last 14 days vs the 14 days before.
  4. Score confidence from history length and day-to-day variability.
  5. Write a plain-language explanation.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import fmean, pstdev

from app.schemas.forecasting import (
    Confidence,
    ConfidenceLevel,
    DailyForecast,
    DataQuality,
    ForecastRequest,
    ForecastResult,
    ForecastStatus,
    PredictionInterval,
    SalesRecord,
    Trend,
    TrendDirection,
)

# --- Tunable constants (MVP defaults) ---
MIN_DAYS_FOR_FORECAST = 7
MIN_DAYS_FOR_TREND = 14
MIN_DAYS_FOR_SEASONALITY = 28
TREND_WINDOW_DAYS = 14
TREND_THRESHOLD_PCT = 10.0
MODEL_WINDOW_DAYS = 90       # only the most recent 90 days drive the model
SEASONALITY_WINDOW_DAYS = 56  # last 8 weeks for day-of-week factors
ALPHA, BETA, PHI = 0.3, 0.1, 0.9  # Holt level / trend smoothing, trend damping
WARMUP_DAYS = 7
INTERVAL_LEVEL = 0.8
Z_80 = 1.2816

METHOD_MOVING_AVERAGE = "moving_average"
METHOD_HOLT = "damped_trend_smoothing"
METHOD_HOLT_SEASONAL = "damped_trend_smoothing_weekly_seasonality"


@dataclass
class DailySeries:
    dates: list[date]
    values: list[float]
    days_with_sales: int
    days_without_records: int


# ---------------------------------------------------------------- helpers

def build_daily_series(history: list[SalesRecord], as_of_date: date | None) -> DailySeries | None:
    """Aggregate records per day and fill unrecorded days with zero."""
    if not history:
        return None
    totals: dict[date, float] = defaultdict(float)
    for rec in history:
        totals[rec.date] += rec.quantity
    start = min(totals)
    end = max(as_of_date or start, max(totals))
    n = (end - start).days + 1
    dates = [start + timedelta(days=i) for i in range(n)]
    values = [totals.get(d, 0.0) for d in dates]
    return DailySeries(
        dates=dates,
        values=values,
        days_with_sales=sum(1 for v in totals.values() if v > 0),
        days_without_records=n - len(totals),
    )


def detect_trend(values: list[float]) -> Trend:
    """Compare the recent window's average with the window before it."""
    n = len(values)
    if n < MIN_DAYS_FOR_TREND:
        return Trend(direction=TrendDirection.UNKNOWN, change_pct=None, window_days=None)
    w = TREND_WINDOW_DAYS if n >= 2 * TREND_WINDOW_DAYS else n // 2
    recent = fmean(values[-w:])
    previous = fmean(values[-2 * w:-w])
    if previous == 0:
        if recent == 0:
            return Trend(direction=TrendDirection.STABLE, change_pct=0.0, window_days=w)
        # Demand appeared from nothing: increasing, but a % change is undefined.
        return Trend(direction=TrendDirection.INCREASING, change_pct=None, window_days=w)
    change = (recent - previous) / previous * 100
    if change >= TREND_THRESHOLD_PCT:
        direction = TrendDirection.INCREASING
    elif change <= -TREND_THRESHOLD_PCT:
        direction = TrendDirection.DECREASING
    else:
        direction = TrendDirection.STABLE
    return Trend(direction=direction, change_pct=round(change, 1), window_days=w)


def weekday_factors(dates: list[date], values: list[float]) -> list[float] | None:
    """Multiplicative day-of-week factors (mean 1.0) from the last full weeks."""
    n = len(values)
    if n < MIN_DAYS_FOR_SEASONALITY:
        return None
    k = min(SEASONALITY_WINDOW_DAYS, (n // 7) * 7)
    d_win, v_win = dates[-k:], values[-k:]
    overall = fmean(v_win)
    if overall == 0:
        return None
    buckets: dict[int, list[float]] = defaultdict(list)
    for d, v in zip(d_win, v_win):
        buckets[d.weekday()].append(v)
    return [fmean(buckets[wd]) / overall for wd in range(7)]


def holt_damped(values: list[float | None]) -> tuple[float, float, list[float]]:
    """Damped-trend exponential smoothing. `None` values are skipped (no update).

    Returns the final level, the final trend and the one-step-ahead residuals (after warm-up).
    """
    observed = [v for v in values if v is not None]
    first = observed[:WARMUP_DAYS]
    second = observed[WARMUP_DAYS:2 * WARMUP_DAYS]
    level = fmean(first)
    trend = (fmean(second) - level) / WARMUP_DAYS if second else 0.0
    residuals: list[float] = []
    for i, y in enumerate(values):
        pred = level + PHI * trend
        if y is None:
            level, trend = pred, PHI * trend
            continue
        if i >= WARMUP_DAYS:
            residuals.append(y - pred)
        new_level = ALPHA * y + (1 - ALPHA) * pred
        trend = BETA * (new_level - level) + (1 - BETA) * PHI * trend
        level = new_level
    return level, trend, residuals


def damped_steps(trend: float, h: int) -> list[float]:
    """Cumulative damped trend contribution for steps 1..h."""
    out, acc, phi_k = [], 0.0, 1.0
    for _ in range(h):
        phi_k *= PHI
        acc += phi_k
        out.append(acc * trend)
    return out


def score_confidence(values: list[float], series: DailySeries) -> Confidence:
    n = len(values)
    mean = fmean(values)
    reasons = [f"Based on {n} days of sales history."]
    if mean == 0:
        reasons.append("No sales were recorded in this period.")
        return Confidence(level=ConfidenceLevel.LOW, reasons=reasons)

    cv = pstdev(values) / mean
    if cv <= 0.5:
        reasons.append("Daily sales are consistent.")
    elif cv <= 1.0:
        reasons.append("Daily sales vary moderately.")
    else:
        reasons.append("Daily sales are irregular (many zero or spike days).")
    if n < MIN_DAYS_FOR_SEASONALITY:
        reasons.append("Less than 28 days of history, so weekly patterns are not modelled.")
    total_days = len(series.values)
    if total_days and series.days_without_records / total_days > 0.5:
        reasons.append("More than half of the days have no recorded sales.")

    if n >= 56 and cv <= 0.5:
        level = ConfidenceLevel.HIGH
    elif n >= MIN_DAYS_FOR_SEASONALITY and cv <= 1.0:
        level = ConfidenceLevel.MEDIUM
    else:
        level = ConfidenceLevel.LOW
    return Confidence(level=level, reasons=reasons)


def _fmt(x: float) -> str:
    return f"{x:,.1f}".rstrip("0").rstrip(".")


def _trend_sentence(trend: Trend) -> str:
    if trend.direction == TrendDirection.UNKNOWN:
        return "There is not enough history yet to tell whether demand is rising or falling."
    if trend.change_pct is None and trend.direction == TrendDirection.INCREASING:
        return (f"Demand is increasing: the product started selling in the last "
                f"{trend.window_days} days after no sales in the {trend.window_days} days before.")
    w = trend.window_days
    if trend.direction == TrendDirection.STABLE:
        return (f"Demand is stable ({trend.change_pct:+.1f}% over the last {w} days "
                f"vs the {w} days before).")
    return (f"Demand is {trend.direction.value} ({trend.change_pct:+.1f}% over the last {w} days "
            f"vs the {w} days before).")


# ---------------------------------------------------------------- main entry

def forecast_product(req: ForecastRequest) -> ForecastResult:
    series = build_daily_series(req.sales_history, req.as_of_date)
    h = req.horizon_days

    if series is None:
        return _insufficient(req, None, [], "No sales history has been recorded for this product yet.")

    data_quality = DataQuality(
        history_days=len(series.values),
        days_with_sales=series.days_with_sales,
        days_without_records=series.days_without_records,
        first_date=series.dates[0],
        last_date=series.dates[-1],
        total_units_sold=round(sum(series.values), 2),
    )

    if len(series.values) < MIN_DAYS_FOR_FORECAST:
        return _insufficient(
            req, data_quality, series.values,
            f"Only {len(series.values)} day(s) of sales history are available.",
        )

    dates = series.dates[-MODEL_WINDOW_DAYS:]
    values = series.values[-MODEL_WINDOW_DAYS:]
    n = len(values)
    avg = fmean(values)
    trend = detect_trend(values)
    confidence = score_confidence(values, series)
    future_dates = [series.dates[-1] + timedelta(days=i) for i in range(1, h + 1)]

    if n < MIN_DAYS_FOR_TREND:
        method = METHOD_MOVING_AVERAGE
        daily = [avg] * h
        sigma = pstdev(values)
    else:
        factors = weekday_factors(dates, values)
        if factors:
            method = METHOD_HOLT_SEASONAL
            adjusted = [
                (v / factors[d.weekday()]) if factors[d.weekday()] > 0 else None
                for d, v in zip(dates, values)
            ]
        else:
            method = METHOD_HOLT
            adjusted = list(values)
        level, slope, residuals = holt_damped(adjusted)
        steps = damped_steps(slope, h)
        daily = []
        for d, step in zip(future_dates, steps):
            base = max(0.0, level + step)
            daily.append(base * factors[d.weekday()] if factors else base)
        sigma = pstdev(residuals) if len(residuals) >= 2 else pstdev(values)

    daily = [max(0.0, x) for x in daily]
    total = sum(daily)
    half_width = Z_80 * sigma * math.sqrt(h)
    interval = PredictionInterval(
        lower=round(max(0.0, total - half_width), 2),
        upper=round(total + half_width, 2),
        level=INTERVAL_LEVEL,
    )

    explanation = (
        f"{req.product_name} sold an average of {_fmt(avg)} units per day over the last {n} days. "
        f"{_trend_sentence(trend)} "
        f"Predicted demand for the next {h} days: {round(total)} units "
        f"(likely range {round(interval.lower)}–{round(interval.upper)}). "
        f"Confidence: {confidence.level.value}. {confidence.reasons[0]}"
    )

    return ForecastResult(
        product_id=req.product_id,
        product_name=req.product_name,
        status=ForecastStatus.OK,
        method=method,
        horizon_days=h,
        forecast_start=future_dates[0],
        forecast_end=future_dates[-1],
        historical_avg_daily_sales=round(avg, 2),
        predicted_demand=round(total, 2),
        predicted_demand_units=round(total),
        prediction_interval=interval,
        daily_forecast=[
            DailyForecast(date=d, predicted_quantity=round(q, 2)) for d, q in zip(future_dates, daily)
        ],
        trend=trend,
        confidence=confidence,
        data_quality=data_quality,
        explanation=explanation,
    )


def _insufficient(
    req: ForecastRequest, dq: DataQuality | None, values: list[float], reason: str
) -> ForecastResult:
    needed = MIN_DAYS_FOR_FORECAST
    explanation = (
        f"{reason} A forecast for {req.product_name} needs at least {needed} days of history, "
        f"so no prediction was made. Keep recording sales and the forecast will appear automatically."
    )
    return ForecastResult(
        product_id=req.product_id,
        product_name=req.product_name,
        status=ForecastStatus.INSUFFICIENT_DATA,
        method=None,
        horizon_days=req.horizon_days,
        forecast_start=None,
        forecast_end=None,
        historical_avg_daily_sales=round(fmean(values), 2) if values else None,
        predicted_demand=None,
        predicted_demand_units=None,
        prediction_interval=None,
        daily_forecast=[],
        trend=Trend(direction=TrendDirection.UNKNOWN, change_pct=None, window_days=None),
        confidence=Confidence(level=ConfidenceLevel.NONE, reasons=[reason]),
        data_quality=dq or DataQuality(
            history_days=0, days_with_sales=0, days_without_records=0,
            first_date=None, last_date=None, total_units_sold=0,
        ),
        explanation=explanation,
    )
