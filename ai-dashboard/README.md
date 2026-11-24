# OptiSell AI Dashboard (React)

React + TypeScript (Vite) UI for the AI service's **Module A: sales forecasting**.

```
src/
  api/types.ts                  types mirroring ai-service/app/schemas (keep in sync)
  api/client.ts                 fetch client, unwraps {success,data,error,meta}, throws AiServiceError
  lib/csv.ts                    parses "date,quantity" CSV, reports bad rows (never auto-fills them)
  lib/useForecast.ts            request state hook (idle/loading/success/error, cancels stale requests)
  components/ForecastForm.tsx   product + horizon + CSV input
  components/ForecastCard.tsx   demand, trend, confidence, explanation; "insufficient_data" state
  components/ForecastChart.tsx  dependency-free SVG chart of daily_forecast
```

## Run (dev)

```powershell
# 1) AI service
cd ai-service; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8001 --env-file .env
# 2) Dashboard
cd ai-dashboard; npm install; copy .env.example .env; npm run dev   # http://localhost:5173
```

The Vite dev proxy forwards `/api/v1/ai/*` to `AI_SERVICE_URL` and adds `X-API-Key` on the server
side, so the key never reaches the browser.

## Production

Browsers should not call the AI service directly. Set `VITE_AI_API_BASE` to the OptiSell backend
route that wraps the AI service. `api/*` and the components can be copied into the main frontend as is.

The 80% `prediction_interval` covers the **horizon total**, so the card shows it as text and the
chart does not draw a per-day band.
