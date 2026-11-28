import { forwardRef } from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useI18n } from '../../i18n';

export function Spinner({ className }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden="true" />;
}

export function Button({ variant = 'primary', size, loading, className, children, icon: Icon, ...props }) {
  return (
    <button
      type="button"
      className={cn('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', size === 'icon' && 'btn-icon', className)}
      {...props}
      disabled={loading || props.disabled}
    >
      {loading ? <Spinner /> : Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }) {
  return <div className={cn('card', className)} {...props}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, className }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-50">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/25',
  warning: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/25',
  danger: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/25',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/25',
  neutral: 'bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-600/40',
};

export function Badge({ tone = 'neutral', className, children, icon: Icon }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {children}
    </span>
  );
}

export const Input = forwardRef(function Input({ label, error, hint, className, id, ...props }, ref) {
  const inputId = id || props.name;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="label">{label}</label>}
      <input ref={ref} id={inputId} className={cn('input', error && 'input-error')} aria-invalid={!!error} {...props} />
      {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
});

export function Select({ label, error, className, id, children, ...props }) {
  const inputId = id || props.name;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="label">{label}</label>}
      <select id={inputId} className={cn('input pr-8', error && 'input-error')} {...props}>{children}</select>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function Skeleton({ className, style }) {
  return <div style={style} className={cn('animate-pulse rounded-md bg-zinc-200/70 dark:bg-zinc-800', className)} />;
}

export function EmptyState({ icon: Icon = Inbox, title, message, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }) {
  const { t } = useI18n();
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)} role="alert">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('error.loadTitle')}</p>
      <p className="mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-4" onClick={onRetry}>{t('common.tryAgain')}</Button>}
    </div>
  );
}

/** KPI tile. `change` is % vs previous period; `invert` when lower is better (expenses). */
export function StatCard({ label, value, change, invert, icon: Icon, hint, loading, tone = 'brand' }) {
  const up = change > 0;
  const good = change == null || change === 0 ? null : invert ? !up : up;
  const toneCls = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    neutral: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  }[tone];
  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        {Icon && <span className={cn('grid h-8 w-8 place-items-center rounded-lg', toneCls)}><Icon className="h-4 w-4" /></span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-32" />
      ) : (
        <p key={String(value)} className="num num-pop mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{value}</p>
      )}
      <div className="mt-1.5 flex min-h-[20px] items-center gap-1.5 text-xs">
        {!loading && change != null && (
          <span className={cn('inline-flex items-center gap-0.5 font-medium', good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
        {!loading && hint && <span className="text-zinc-500 dark:text-zinc-400">{hint}</span>}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((__, j) => <Skeleton key={j} className={cn('h-4', j === 0 ? 'w-1/3' : 'flex-1')} />)}
        </div>
      ))}
    </div>
  );
}
