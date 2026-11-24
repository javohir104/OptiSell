import type { DailyForecast } from "../api/types";

type Props = { forecast: DailyForecast[] };

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

/** Daily predicted quantities. The 80% interval is for the horizon total, so it is shown as text, not as a per-day band. */
export const ForecastChart = ({ forecast }: Props) => {
  if (forecast.length === 0) return null;

  const max = Math.max(...forecast.map((d) => d.predicted_quantity), 1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (forecast.length === 1 ? innerW / 2 : (i / (forecast.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const line = forecast.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.predicted_quantity)}`).join(" ");
  const area = `${line} L${x(forecast.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const labelEvery = Math.ceil(forecast.length / 7);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Kunlik prognoz grafigi">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(max * t)} y2={y(max * t)} className="grid" />
          <text x={PAD.left - 6} y={y(max * t) + 4} textAnchor="end" className="axis">
            {(max * t).toFixed(max * t < 10 ? 1 : 0)}
          </text>
        </g>
      ))}
      <path d={area} className="area" />
      <path d={line} className="line" />
      {forecast.map((d, i) => (
        <g key={d.date}>
          <circle cx={x(i)} cy={y(d.predicted_quantity)} r={3} className="dot">
            <title>{`${d.date}: ${d.predicted_quantity.toFixed(2)}`}</title>
          </circle>
          {i % labelEvery === 0 && (
            <text x={x(i)} y={H - 8} textAnchor="middle" className="axis">
              {d.date.slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
};
