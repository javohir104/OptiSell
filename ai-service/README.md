# OptiSell AI Service

Python/FastAPI microservice that powers OptiSell's AI features.

| Module | Status | Endpoints |
|---|---|---|
| A — Sales forecasting | ✅ MVP | `POST /api/v1/ai/forecast`, `POST /api/v1/ai/forecast/batch` |
| B — Purchasing recommendations | ⏳ next | — |
| C — Business insights | ⏳ planned | — |

## Architecture

```
Browser (dashboard) ──> OptiSell backend ──(X-API-Key)──> AI service
                         owns the DB                       stateless, no DB access
```

- **Stateless.** The backend reads real sales from its database and sends them in the request.
  The AI service never stores or invents data, so it doesn't depend on the backend's DB schema.
- **Namespaced routes.** Everything lives under `/api/v1/ai/*`, so it can't collide with backend routes.
- **One envelope** for every response, success or error:

```json
{ "success": true, "data": { ... }, "error": null,
  "meta": { "request_id": "...", "generated_at": "...", "service": "optisell-ai-service", "service_version": "0.1.0" } }
```
```json
{ "success": false, "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "field": "sales_history.0.quantity", "message": "..." }] },
  "meta": { ... } }
```

Error codes: `VALIDATION_ERROR` (422), `UNAUTHORIZED` (401), `NOT_FOUND` (404), `INTERNAL_ERROR` (500).

```
ai-service/
  app/
    main.py                      app factory, router registration
    core/config.py               env-based settings
    core/security.py             X-API-Key check
    core/errors.py               error -> envelope handlers
    schemas/common.py            ApiResponse envelope
    schemas/forecasting.py       Module A request/response models
    services/forecasting_service.py   forecasting engine (pure functions)
    api/forecasting.py           Module A routes
    models/                      reserved for trained/persisted models (P2)
  tests/
```

## Setup (Windows / PowerShell)

```powershell
cd ai-service
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8001 --env-file .env
```

macOS/Linux: `python3 -m venv .venv && source .venv/bin/activate`, then the same commands.

Interactive API docs: http://localhost:8001/docs

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OPTISELL_AI_ENV` | `development` | Environment label |
| `OPTISELL_AI_API_KEY` | *(empty)* | Shared secret the backend sends as `X-API-Key`. **Required in production**; empty disables auth |
| `OPTISELL_AI_CORS_ORIGINS` | *(empty)* | Comma-separated origins. Normally empty because browsers call the backend, not this service |
| `OPTISELL_AI_MAX_HISTORY_DAYS` | `730` | Max history span per product |
| `OPTISELL_AI_MAX_BATCH_SIZE` | `200` | Max products per batch call |
| `OPTISELL_AI_MAX_HORIZON_DAYS` | `90` | Max forecast horizon |

## Testing

```powershell
pytest -q
```

Unit tests cover the engine (missing data, gaps, trends, seasonality, non-negative output).
API tests cover the envelope, validation, auth and batch. The synthetic series in `tests/`
exist only for tests; nothing synthetic is used at runtime.

---

## Module A — Sales forecasting

### `POST /api/v1/ai/forecast`

Request:
```json
{
  "product_id": "sku-001",
  "product_name": "Coca-Cola 1L",
  "horizon_days": 7,
  "as_of_date": "2026-11-24",
  "sales_history": [
    { "date": "2026-09-01", "quantity": 14 },
    { "date": "2026-09-02", "quantity": 17 }
  ]
}
```

| Field | Rules |
|---|---|
| `sales_history[].quantity` | `>= 0`. Multiple rows on the same date are summed, so the backend can send raw per-sale rows or daily totals |
| `horizon_days` | 1–90, default 7 |
| `as_of_date` | Optional, usually today. Days between the last sale and this date count as **zero-sale days**. Send it so a product that stopped selling is detected |

Response `data` (abridged):
```json
{
  "product_id": "sku-001", "product_name": "Coca-Cola 1L",
  "status": "ok", "is_demo": false,
  "method": "damped_trend_smoothing_weekly_seasonality",
  "horizon_days": 7, "forecast_start": "2026-11-25", "forecast_end": "2026-12-01",
  "historical_avg_daily_sales": 16.1,
  "predicted_demand": 132.27, "predicted_demand_units": 132,
  "prediction_interval": { "lower": 118.4, "upper": 146.1, "level": 0.8 },
  "daily_forecast": [{ "date": "2026-11-25", "predicted_quantity": 16.85 }],
  "trend": { "direction": "increasing", "change_pct": 18.2, "window_days": 14 },
  "confidence": { "level": "high", "reasons": ["Based on 60 days of sales history.", "Daily sales are consistent."] },
  "data_quality": { "history_days": 60, "days_with_sales": 58, "days_without_records": 2,
                    "first_date": "2026-09-26", "last_date": "2026-11-24", "total_units_sold": 966.0 },
  "explanation": "Coca-Cola 1L sold an average of 16.1 units per day over the last 60 days. ..."
}
```

Enums: `status` = `ok | insufficient_data`; `trend.direction` = `increasing | decreasing | stable | unknown`;
`confidence.level` = `high | medium | low | none`.

### `POST /api/v1/ai/forecast/batch`

```json
{ "horizon_days": 7, "as_of_date": "2026-11-24",
  "products": [ { "product_id": "...", "product_name": "...", "sales_history": [...] } ] }
```
Returns `{ horizon_days, total_products, forecasted, insufficient_data, results: [ForecastResult...] }`.
The batch-level `horizon_days` and `as_of_date` override the per-product values.

### How the forecast is made

| History | Method | Notes |
|---|---|---|
| 0–6 days | none | `status: "insufficient_data"`, no numbers are invented. Still HTTP 200 so the dashboard can show a "collecting data" state |
| 7–13 days | moving average | trend `unknown`, confidence `low` |
| 14–27 days | damped-trend exponential smoothing (Holt) | trend detected |
| 28+ days | Holt + day-of-week seasonality | captures weekend/weekday patterns |

- Only the most recent 90 days drive the model.
- **Trend:** average of the last 14 days vs the 14 days before. ±10% or more counts as increasing/decreasing.
- **Confidence:** `high` = 56+ days and steady sales (coefficient of variation ≤ 0.5);
  `medium` = 28+ days and CV ≤ 1.0; otherwise `low`.
- **80% prediction interval** from one-step-ahead residuals, widened by √horizon.
- Output is never negative.

## Integrating with the OptiSell backend

1. Run the AI service next to the backend (port 8001 or its own container). Set the same
   `OPTISELL_AI_API_KEY` on both sides.
2. In the backend, add a small client that:
   - queries daily sales per product (e.g. `SELECT product_id, DATE(created_at) AS date, SUM(quantity) ... GROUP BY 1,2`,
     adjusted to your real table names) for the last 90–180 days;
   - calls `POST /api/v1/ai/forecast/batch` with `as_of_date = today` and header `X-API-Key`;
   - returns `data` to the dashboard through the backend's own route.
3. Dashboard display:
   - `status = "insufficient_data"`: show a "Not enough sales data yet" badge with `explanation`, never a number.
   - `status = "ok"`: show `predicted_demand_units`, a trend arrow from `trend.direction`, a confidence badge,
     and a `daily_forecast` line chart with the `prediction_interval` band.

Example backend call (Node):
```js
const res = await fetch(`${process.env.AI_SERVICE_URL}/api/v1/ai/forecast/batch`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": process.env.AI_SERVICE_API_KEY },
  body: JSON.stringify({ horizon_days: 7, as_of_date: today, products }),
});
const body = await res.json();
if (!body.success) throw new Error(`${body.error.code}: ${body.error.message}`);
```
