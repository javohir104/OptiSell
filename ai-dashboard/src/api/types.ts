// Mirrors ai-service/app/schemas/{common,forecasting}.py. Keep in sync with the backend.

export type IsoDate = string; // "YYYY-MM-DD"

export type ApiErrorDetail = { field: string; message: string };

export type ApiError = {
  code: "VALIDATION_ERROR" | "UNAUTHORIZED" | "NOT_FOUND" | "INTERNAL_ERROR" | "HTTP_ERROR" | string;
  message: string;
  details: ApiErrorDetail[] | unknown | null;
};

export type Meta = {
  request_id: string;
  generated_at: string;
  service: string;
  service_version: string;
};

export type ApiResponse<T> =
  | { success: true; data: T; error: null; meta: Meta }
  | { success: false; data: null; error: ApiError; meta: Meta };

export type SalesRecord = { date: IsoDate; quantity: number };

export type ForecastRequest = {
  product_id: string;
  product_name: string;
  sales_history: SalesRecord[];
  horizon_days?: number;
  as_of_date?: IsoDate;
};

export type BatchForecastRequest = {
  horizon_days?: number;
  as_of_date?: IsoDate;
  products: ForecastRequest[];
};

export type ForecastStatus = "ok" | "insufficient_data";
export type TrendDirection = "increasing" | "decreasing" | "stable" | "unknown";
export type ConfidenceLevel = "high" | "medium" | "low" | "none";

export type DailyForecast = { date: IsoDate; predicted_quantity: number };
export type PredictionInterval = { lower: number; upper: number; level: number };
export type Trend = { direction: TrendDirection; change_pct: number | null; window_days: number | null };
export type Confidence = { level: ConfidenceLevel; reasons: string[] };

export type DataQuality = {
  history_days: number;
  days_with_sales: number;
  days_without_records: number;
  first_date: IsoDate | null;
  last_date: IsoDate | null;
  total_units_sold: number;
};

export type ForecastResult = {
  product_id: string;
  product_name: string;
  status: ForecastStatus;
  is_demo: boolean;
  method: string | null;
  horizon_days: number;
  forecast_start: IsoDate | null;
  forecast_end: IsoDate | null;
  historical_avg_daily_sales: number | null;
  predicted_demand: number | null;
  predicted_demand_units: number | null;
  prediction_interval: PredictionInterval | null;
  daily_forecast: DailyForecast[];
  trend: Trend;
  confidence: Confidence;
  data_quality: DataQuality;
  explanation: string;
};

export type BatchForecastResult = {
  horizon_days: number;
  total_products: number;
  forecasted: number;
  insufficient_data: number;
  results: ForecastResult[];
};
