import { cn } from '../../utils/cn';

export default function Logo({ className, compact }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#059669" />
        <path d="M9 19.5l5-5 3.5 3.5L23 12.5" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.5 12.5H23V17" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && <span className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Opti<span className="text-brand-600 dark:text-brand-400">Sell</span></span>}
    </span>
  );
}
