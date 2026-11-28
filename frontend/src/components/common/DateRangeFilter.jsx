import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '../../utils/cn';
import { daysAgo, toDayKey } from '../../utils/format';
import { useI18n } from '../../i18n';

export const PRESETS = [
  { key: '7d', label: 'range.7d', days: 7 },
  { key: '30d', label: 'range.30d', days: 30 },
  { key: '90d', label: 'range.90d', days: 90 },
];

export const rangeFromPreset = (key) => {
  const p = PRESETS.find((x) => x.key === key) || PRESETS[1];
  return { preset: p.key, from: daysAgo(p.days - 1), to: toDayKey(new Date()) };
};

const segCls = (active) => cn(
  'inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors',
  active ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
);

/** value: { preset, from, to } (YYYY-MM-DD, inclusive) */
export default function DateRangeFilter({ value, onChange }) {
  const { t } = useI18n();
  const [custom, setCustom] = useState(value.preset === 'custom');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900" role="group" aria-label={t('range.label')}>
        {PRESETS.map((p) => (
          <button key={p.key} type="button" className={segCls(value.preset === p.key)} aria-pressed={value.preset === p.key}
            onClick={() => { setCustom(false); onChange(rangeFromPreset(p.key)); }}>{t(p.label)}</button>
        ))}
        <button type="button" className={segCls(value.preset === 'custom')} onClick={() => setCustom((c) => !c)} aria-expanded={custom}>
          <CalendarDays className="h-3.5 w-3.5" /> {t('range.custom')}
        </button>
      </div>
      {custom && (
        <div className="flex items-center gap-1.5">
          <input type="date" className="input h-9 w-[9.5rem]" value={value.from} max={value.to} aria-label={t('range.from')}
            onChange={(e) => e.target.value && onChange({ preset: 'custom', from: e.target.value, to: value.to })} />
          <span className="text-zinc-400">–</span>
          <input type="date" className="input h-9 w-[9.5rem]" value={value.to} min={value.from} max={toDayKey(new Date())} aria-label={t('range.to')}
            onChange={(e) => e.target.value && onChange({ preset: 'custom', from: value.from, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
