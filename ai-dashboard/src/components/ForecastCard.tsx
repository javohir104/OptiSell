import type { ConfidenceLevel, ForecastResult, TrendDirection } from "../api/types";
import { ForecastChart } from "./ForecastChart";

const TREND: Record<TrendDirection, { icon: string; label: string }> = {
  increasing: { icon: "▲", label: "O'smoqda" },
  decreasing: { icon: "▼", label: "Kamaymoqda" },
  stable: { icon: "■", label: "Barqaror" },
  unknown: { icon: "?", label: "Aniqlanmagan" },
};

const CONFIDENCE: Record<ConfidenceLevel, string> = {
  high: "Yuqori ishonch",
  medium: "O'rtacha ishonch",
  low: "Past ishonch",
  none: "Prognoz yo'q",
};

const fmt = (n: number) => n.toLocaleString("uz-UZ", { maximumFractionDigits: 1 });

export const ForecastCard = ({ result }: { result: ForecastResult }) => {
  const { trend, confidence, data_quality: dq } = result;

  if (result.status === "insufficient_data") {
    return (
      <section className="panel card">
        <header>
          <h2>{result.product_name}</h2>
          <span className="badge badge-none">Ma'lumot yetarli emas</span>
        </header>
        <p className="explanation">{result.explanation}</p>
        <p className="muted">
          Hozircha {dq.history_days} kunlik tarix bor. Prognoz uchun kamida 7 kunlik sotuv kerak.
        </p>
      </section>
    );
  }

  const t = TREND[trend.direction];

  return (
    <section className="panel card">
      <header>
        <h2>{result.product_name}</h2>
        <span className={`badge badge-${confidence.level}`}>{CONFIDENCE[confidence.level]}</span>
      </header>

      <div className="stats">
        <div className="stat">
          <span className="stat-label">
            {result.horizon_days} kunlik talab ({result.forecast_start} – {result.forecast_end})
          </span>
          <span className="stat-value">{result.predicted_demand_units ?? "—"} dona</span>
          {result.prediction_interval && (
            <span className="muted">
              {Math.round(result.prediction_interval.level * 100)}% oraliq: {fmt(result.prediction_interval.lower)} –{" "}
              {fmt(result.prediction_interval.upper)}
            </span>
          )}
        </div>
        <div className="stat">
          <span className="stat-label">Trend</span>
          <span className={`stat-value trend-${trend.direction}`}>
            {t.icon} {t.label}
            {trend.change_pct !== null && ` (${trend.change_pct > 0 ? "+" : ""}${fmt(trend.change_pct)}%)`}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">O'rtacha kunlik sotuv</span>
          <span className="stat-value">
            {result.historical_avg_daily_sales !== null ? fmt(result.historical_avg_daily_sales) : "—"}
          </span>
        </div>
      </div>

      <ForecastChart forecast={result.daily_forecast} />

      <p className="explanation">{result.explanation}</p>

      <details>
        <summary>Tafsilotlar</summary>
        <ul>
          {confidence.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="muted">
          Usul: {result.method} · Tarix: {dq.history_days} kun ({dq.first_date} – {dq.last_date}) · Sotuvli kunlar:{" "}
          {dq.days_with_sales} · Yozuvsiz kunlar: {dq.days_without_records} · Jami sotilgan: {fmt(dq.total_units_sold)}
        </p>
      </details>
    </section>
  );
};
