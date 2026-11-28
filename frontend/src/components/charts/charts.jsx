import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { formatMoney, formatMoneyAxis, formatNumber, formatShortDate } from '../../utils/format';
import { useI18n } from '../../i18n';

// Validated categorical slots 1–3 (aqua / orange / blue), stepped per mode.
const PALETTE = {
  light: { revenue: '#1baf7a', expenses: '#eb6834', profit: '#2a78d6', grid: '#e7e5e4', axis: '#78716c', cursor: '#a8a29e', surface: '#ffffff' },
  dark: { revenue: '#199e70', expenses: '#d95926', profit: '#3987e5', grid: '#27272a', axis: '#a1a1aa', cursor: '#52525b', surface: '#18181b' },
};

export function useChartColors() {
  const { isDark } = useTheme();
  useI18n(); // re-render charts (axis/tooltip formatting) when the language changes
  return PALETTE[isDark ? 'dark' : 'light'];
}

const axisProps = (c) => ({ stroke: c.axis, fontSize: 11, tickLine: false, axisLine: false });

function TooltipBox({ title, rows }) {
  return (
    <div className="min-w-[160px] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-pop dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-1.5 font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="num font-medium text-zinc-900 dark:text-zinc-100">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.square
            ? <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
            : <span className="w-3.5" style={{ borderTop: `2px ${i.dashed ? 'dashed' : 'solid'} ${i.color}` }} />}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Time series of money values. series: [{ key, label, colorKey }]
 * One shared y-axis (all series are the same unit).
 */
export function MoneyTrendChart({ data, series, height = 280, area = true }) {
  const c = useChartColors();
  const Chart = area ? AreaChart : ComposedChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c[s.colorKey]} stopOpacity={0.18} />
              <stop offset="100%" stopColor={c[s.colorKey]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={28} {...axisProps(c)} />
        <YAxis tickFormatter={formatMoneyAxis} width={64} {...axisProps(c)} />
        <Tooltip
          cursor={{ stroke: c.cursor, strokeWidth: 1 }}
          content={({ active, payload, label }) => active && payload?.length ? (
            <TooltipBox title={formatShortDate(label)} rows={series.map((s) => ({ label: s.label, color: c[s.colorKey], value: formatMoney(payload[0].payload[s.key]) }))} />
          ) : null}
        />
        {series.map((s) => (area ? (
          <Area key={s.key} type="monotone" dataKey={s.key} stroke={c[s.colorKey]} strokeWidth={2} fill={`url(#fill-${s.key})`}
            dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }} />
        ) : (
          <Line key={s.key} type="monotone" dataKey={s.key} stroke={c[s.colorKey]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }} />
        )))}
      </Chart>
    </ResponsiveContainer>
  );
}

/** Daily bar series (orders or units). */
export function CountBarChart({ data, dataKey, label, height = 220, colorKey = 'profit' }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={28} {...axisProps(c)} />
        <YAxis allowDecimals={false} width={40} {...axisProps(c)} />
        <Tooltip
          cursor={{ fill: c.grid, opacity: 0.5 }}
          content={({ active, payload, label: l }) => active && payload?.length ? (
            <TooltipBox title={formatShortDate(l)} rows={[{ label, color: c[colorKey], value: formatNumber(payload[0].value) }]} />
          ) : null}
        />
        <Bar dataKey={dataKey} fill={c[colorKey]} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranking bars (top products / categories). */
export function RankingBarChart({ data, nameKey, valueKey, format = formatMoney, height, colorKey = 'revenue', valueLabel }) {
  const c = useChartColors();
  const { t } = useI18n();
  const h = height || Math.max(160, data.length * 34 + 16);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
        <CartesianGrid stroke={c.grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tickFormatter={formatMoneyAxis} {...axisProps(c)} />
        <YAxis type="category" dataKey={nameKey} width={150} {...axisProps(c)} tick={{ fill: c.axis, fontSize: 11 }}
          tickFormatter={(v) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} />
        <Tooltip
          cursor={{ fill: c.grid, opacity: 0.5 }}
          content={({ active, payload }) => active && payload?.length ? (
            <TooltipBox title={payload[0].payload[nameKey]} rows={[{ label: valueLabel || t('chart.value'), color: c[colorKey], value: format(payload[0].value) }]} />
          ) : null}
        />
        <Bar dataKey={valueKey} fill={c[colorKey]} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Demand forecast: actual history + forecast line with an uncertainty band. */
export function ForecastChart({ history, forecast, height = 300 }) {
  const c = useChartColors();
  const { t } = useI18n();
  const data = [
    ...history.map((h) => ({ date: h.date, actual: h.units })),
    ...forecast.map((f) => ({ date: f.date, forecast: f.units, band: [f.lower, f.upper] })),
  ];
  // connect the two lines
  if (history.length && forecast.length) data[history.length - 1].forecast = history[history.length - 1].units;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={28} {...axisProps(c)} />
        <YAxis width={40} {...axisProps(c)} />
        <Tooltip
          cursor={{ stroke: c.cursor, strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            const rows = [];
            if (p.actual != null) rows.push({ label: t('chart.actualUnits'), color: c.revenue, value: formatNumber(p.actual) });
            if (p.band) {
              rows.push({ label: t('chart.forecast'), color: c.profit, value: p.forecast.toFixed(1) });
              rows.push({ label: t('chart.range80'), value: `${p.band[0].toFixed(1)} – ${p.band[1].toFixed(1)}` });
            }
            return <TooltipBox title={formatShortDate(label)} rows={rows} />;
          }}
        />
        <Area dataKey="band" stroke="none" fill={c.profit} fillOpacity={0.14} isAnimationActive={false} />
        <Line type="monotone" dataKey="actual" stroke={c.revenue} strokeWidth={2} dot={false} connectNulls={false} />
        <Line type="monotone" dataKey="forecast" stroke={c.profit} strokeWidth={2} strokeDasharray="5 4" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
