/**
 * /admin — admin panel inside the normal app layout.
 * Reachable only for role 'admin' (AdminRoute + hidden menu item), and every request is checked
 * again on the backend (role 'admin' in the database), so bypassing the UI gets a 403.
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Activity, CreditCard, DatabaseBackup, Download, FileClock, LayoutDashboard, RefreshCw, Search, ShieldCheck, UserCheck, Users, Wallet,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Select, StatCard, TableSkeleton } from '../components/common/ui';
import { CountBarChart, MoneyTrendChart } from '../components/charts/charts';
import { getErrorMessage } from '../api/axios';
import { adminApi } from '../api/admin.api';
import { useAuth } from '../context/AuthContext';
import { formatDateTime, formatMoney, formatNumber } from '../utils/format';
import { cn } from '../utils/cn';

const PLAN_TONE = { free: 'neutral', pro: 'info', max: 'success' };
const STATUS_TONE = { paid: 'success', pending: 'warning', cancelled: 'danger' };
const STATUS_LABEL = { paid: "To'langan", pending: 'Kutilmoqda', cancelled: 'Bekor qilingan' };
const ACTION_LABEL = {
  'admin.login': 'Admin kirdi',
  'admin.login_failed': "Noto'g'ri parol",
  'admin.login_refused': 'Admin emas — rad etildi',
  'admin.created': 'Admin yaratildi (.env)',
  'role.grant': 'Admin huquqi berildi',
  'role.revoke': 'Admin huquqi olindi',
  'user.update': "Foydalanuvchi o'zgartirildi",
};

/** Load data with loading / error state; reload() refetches. */
function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState({ data: null, loading: false, error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

// --------------------------------------------------------------------------- tabs
function RangePicker({ days, setDays }) {
  return (
    <Select aria-label="Davr" value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-36">
      <option value={7}>7 kun</option>
      <option value={30}>30 kun</option>
      <option value={90}>90 kun</option>
      <option value={365}>1 yil</option>
    </Select>
  );
}

const isoDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const rangeOf = (days) => ({ from: isoDay(new Date(Date.now() - (days - 1) * 86400000)), to: isoDay(new Date()) });

function OverviewTab() {
  const [days, setDays] = useState(30);
  const range = rangeOf(days);
  const interval = days > 120 ? 'month' : days > 31 ? 'week' : 'day';
  const ov = useLoad(() => adminApi.overview(range), [days]);
  const ch = useLoad(() => adminApi.chart({ ...range, interval }), [days]);
  const tr = useLoad(() => adminApi.traffic(range), [days]);

  if (ov.error) return <ErrorState message={getErrorMessage(ov.error)} onRetry={ov.reload} />;
  const d = ov.data;
  const series = (ch.data?.series || []).map((r) => ({ ...r, date: r.period }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">Test/demo akkauntlar va "test" to'lovlar statistikaga kirmaydi.</p>
        <RangePicker days={days} setDays={setDays} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Foydalanuvchilar" icon={Users} loading={ov.loading} value={formatNumber(d?.users.total)}
          hint={d && `+${d.users.registered_in_range} shu davrda · bugun +${d.users.registered_today}`} />
        <StatCard label="Pro / Max (amalda)" icon={UserCheck} loading={ov.loading} value={d && `${d.users.pro} / ${d.users.max}`}
          hint={d && `${d.users.paying} to'lagan · ${d.users.trial} sinov · ${d.users.free} free`} />
        <StatCard label="Daromad (shu davr)" icon={Wallet} loading={ov.loading} value={formatMoney(d?.revenue.range.amount)}
          hint={d && `${d.revenue.range.sales} ta to'lov · jami ${formatMoney(d.revenue.all_time.amount)}`} />
        <StatCard label="Hozir onlayn" icon={Activity} loading={ov.loading} value={d && formatNumber(d.online.visitors_online)}
          hint={d && `${d.online.users_online} kirgan foydalanuvchi · 24 soatda faol ${d.users.active_last_24h}`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sahifa ko'rishlar" tone="neutral" loading={ov.loading} value={formatNumber(d?.visitors.in_range.page_views)}
          hint={d && `bugun ${d.visitors.today.page_views}`} />
        <StatCard label="Unikal tashrifchilar" tone="neutral" loading={ov.loading} value={formatNumber(d?.visitors.in_range.unique_visitors)}
          hint={d && `${d.visitors.in_range.visits} sessiya`} />
        <StatCard label="Bugungi daromad" tone="neutral" loading={ov.loading} value={formatMoney(d?.revenue.today.amount)}
          hint={d && `bu oy ${formatMoney(d.revenue.this_month.amount)}`} />
        <StatCard label="To'lovlar holati" tone="neutral" loading={ov.loading}
          value={d && `${d.revenue.payments_by_status.paid.count} / ${d.revenue.payments_by_status.pending.count} / ${d.revenue.payments_by_status.cancelled.count}`}
          hint="to'langan / kutilmoqda / bekor" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Daromad" subtitle="Click / Payme orqali tasdiqlangan to'lovlar" />
          <div className="p-4">{ch.loading ? <TableSkeleton rows={4} cols={1} /> : <MoneyTrendChart data={series} series={[{ key: 'revenue', label: 'Daromad', colorKey: 'revenue' }]} height={240} />}</div>
        </Card>
        <Card>
          <CardHeader title="Ro'yxatdan o'tishlar" />
          <div className="p-4">{ch.loading ? <TableSkeleton rows={4} cols={1} /> : <CountBarChart data={series} dataKey="registrations" label="Ro'yxatdan o'tdi" height={240} />}</div>
        </Card>
        <Card>
          <CardHeader title="Tashrifchilar" subtitle="Unikal brauzerlar" />
          <div className="p-4">{ch.loading ? <TableSkeleton rows={4} cols={1} /> : <CountBarChart data={series} dataKey="unique_visitors" label="Tashrifchi" colorKey="revenue" height={240} />}</div>
        </Card>
        <Card>
          <CardHeader title="Eng ko'p ochilgan sahifalar" />
          <SimpleTable loading={tr.loading} rows={tr.data?.top_pages} empty="Hali tashrif yo'q"
            cols={[['Sahifa', (r) => <span className="font-mono text-xs">{r.path}</span>], ["Ko'rish", (r) => formatNumber(r.page_views)], ['Tashrifchi', (r) => formatNumber(r.unique_visitors)]]} />
        </Card>
      </div>
    </div>
  );
}

function SimpleTable({ cols, rows, loading, empty = "Ma'lumot yo'q", onRow }) {
  if (loading) return <TableSkeleton rows={5} cols={cols.length} />;
  if (!rows?.length) return <EmptyState title={empty} className="py-10" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
          <tr>{cols.map(([h]) => <th key={h} className="whitespace-nowrap px-4 py-2.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((r, i) => (
            <tr key={r.id ?? i} onClick={onRow ? () => onRow(r) : undefined} className={cn(onRow && 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900')}>
              {cols.map(([h, render]) => <td key={h} className="whitespace-nowrap px-4 py-2.5 text-zinc-700 dark:text-zinc-300">{render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ meta, page, setPage }) {
  if (!meta || meta.total_pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800">
      <span>Jami {formatNumber(meta.total)}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Oldingi</Button>
        <span>{page} / {meta.total_pages}</span>
        <Button variant="secondary" size="sm" disabled={page >= meta.total_pages} onClick={() => setPage(page + 1)}>Keyingi</Button>
      </div>
    </div>
  );
}

function UserDetail({ id, onClose, onChanged }) {
  const u = useLoad(() => adminApi.user(id), [id]);
  const [busy, setBusy] = useState(false);
  const toggleTest = async () => {
    setBusy(true);
    try {
      await adminApi.setTestAccount(id, !u.data.is_test_account);
      toast.success('Saqlandi');
      u.reload();
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="card-pad">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{u.data?.full_name || '…'}</h3>
          <p className="text-sm text-zinc-500">{u.data?.email}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Yopish</Button>
      </div>
      {u.error && <ErrorState message={getErrorMessage(u.error)} onRetry={u.reload} />}
      {u.data && (
        <div className="mt-4 space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <dt className="text-zinc-500">Tarif</dt><dd><Badge tone={PLAN_TONE[u.data.plan]}>{u.data.plan.toUpperCase()}</Badge>{u.data.is_trial && <span className="ml-1 text-xs text-zinc-500">sinov</span>}</dd>
            <dt className="text-zinc-500">Tugaydi</dt><dd>{u.data.plan_expires_at ? formatDateTime(u.data.plan_expires_at) : '—'}</dd>
            <dt className="text-zinc-500">Do'kon</dt><dd>{u.data.business_name || '—'}</dd>
            <dt className="text-zinc-500">Telefon</dt><dd>{u.data.phone || '—'}</dd>
            <dt className="text-zinc-500">Ro'yxatdan</dt><dd>{formatDateTime(u.data.registered_at)}</dd>
            <dt className="text-zinc-500">Oxirgi faollik</dt><dd>{u.data.last_active_at ? formatDateTime(u.data.last_active_at) : '—'}</dd>
            <dt className="text-zinc-500">Mahsulotlar</dt><dd>{formatNumber(u.data.usage.products)}</dd>
            <dt className="text-zinc-500">Sotuvlar</dt><dd>{formatNumber(u.data.usage.sales)} · {formatMoney(u.data.usage.sales_total)}</dd>
            <dt className="text-zinc-500">AI (bu oy)</dt><dd>{formatNumber(u.data.usage.ai_requests_this_month)}</dd>
            <dt className="text-zinc-500">To'lagan</dt><dd>{u.data.payments.paid_count} ta · {formatMoney(u.data.payments.paid_total)}</dd>
          </dl>
          <Button variant="secondary" size="sm" onClick={async () => {
            try {
              const link = await adminApi.resetLink(id);
              const url = `${window.location.origin}${link.path}`;
              try { await navigator.clipboard.writeText(url); toast.success('Parol tiklash havolasi nusxalandi (24 soat amal qiladi)'); } catch { window.prompt('Havola (24 soat):', url); }
            } catch (err) { toast.error(getErrorMessage(err)); }
          }}>Parol tiklash havolasi</Button>
          {u.data.role === 'user' && (
            <Button variant="secondary" size="sm" loading={busy} onClick={toggleTest}>
              {u.data.is_test_account ? 'Haqiqiy akkaunt deb belgilash' : 'Test akkaunt deb belgilash'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function UsersTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const [selected, setSelected] = useState(null);
  const list = useLoad(() => adminApi.users({ page, limit: 20, ...(q && { search: q }), ...(plan && { plan }) }), [page, q, plan]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Card>
        <form className="flex flex-wrap gap-2 p-4" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(search.trim()); }}>
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input className="input pl-9" placeholder="Email, ism, do'kon, telefon" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select aria-label="Tarif" value={plan} onChange={(e) => { setPage(1); setPlan(e.target.value); }} className="w-32">
            <option value="">Barcha tariflar</option><option value="free">Free</option><option value="pro">Pro</option><option value="max">Max</option>
          </Select>
          <Button type="submit" variant="secondary">Qidirish</Button>
        </form>
        {list.error ? <ErrorState message={getErrorMessage(list.error)} onRetry={list.reload} /> : (
          <SimpleTable loading={list.loading} rows={list.data?.data} onRow={(r) => setSelected(r.id)} cols={[
            ['Foydalanuvchi', (r) => <div><div className="font-medium text-zinc-900 dark:text-zinc-100">{r.full_name}</div><div className="text-xs text-zinc-500">{r.email}</div></div>],
            ['Tarif', (r) => <><Badge tone={PLAN_TONE[r.plan]}>{r.plan.toUpperCase()}</Badge>{r.is_trial && <span className="ml-1 text-xs text-zinc-500">sinov</span>}</>],
            ["To'lagan", (r) => formatMoney(r.payments.paid_total)],
            ["Ro'yxatdan", (r) => formatDateTime(r.registered_at)],
            ['Oxirgi faollik', (r) => (r.last_active_at ? formatDateTime(r.last_active_at) : '—')],
            ['', (r) => <>{r.role === 'admin' && <Badge tone="info">admin</Badge>} {r.is_test_account && <Badge>test</Badge>}</>],
          ]} />
        )}
        <Pager meta={list.data?.meta} page={page} setPage={setPage} />
      </Card>
      {selected ? <UserDetail id={selected} onClose={() => setSelected(null)} onChanged={list.reload} />
        : <Card className="card-pad text-sm text-zinc-500">Batafsil ko'rish uchun foydalanuvchini tanlang.</Card>}
    </div>
  );
}

function PaymentsTab() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [test, setTest] = useState('exclude');
  const list = useLoad(() => adminApi.payments({ page, limit: 20, test, ...(status && { status }) }), [page, status, test]);
  const meta = list.data?.meta;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 p-4">
        <Select aria-label="Holat" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="w-40">
          <option value="">Barcha holatlar</option><option value="paid">To'langan</option><option value="pending">Kutilmoqda</option><option value="cancelled">Bekor qilingan</option>
        </Select>
        <Select aria-label="Test" value={test} onChange={(e) => { setPage(1); setTest(e.target.value); }} className="w-44">
          <option value="exclude">Faqat haqiqiy</option><option value="include">Hammasi</option><option value="only">Faqat test</option>
        </Select>
        {meta && <span className="ml-auto text-sm text-zinc-500">Haqiqiy daromad: <b className="text-zinc-900 dark:text-zinc-100">{formatMoney(meta.real_paid_total)}</b> ({meta.real_paid_count} ta)</span>}
      </div>
      {list.error ? <ErrorState message={getErrorMessage(list.error)} onRetry={list.reload} /> : (
        <SimpleTable loading={list.loading} rows={list.data?.data} empty="To'lovlar yo'q" cols={[
          ['№', (r) => `#${r.order_no}`],
          ['Foydalanuvchi', (r) => <div><div>{r.user.full_name}</div><div className="text-xs text-zinc-500">{r.user.email}</div></div>],
          ['Tarif', (r) => `${r.plan.toUpperCase()} · ${r.months} oy`],
          ['Summa', (r) => formatMoney(r.amount)],
          ['Tizim', (r) => <>{r.provider}{r.is_test && <Badge className="ml-1">test</Badge>}</>],
          ['Holat', (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] || r.status}</Badge>],
          ['Yaratilgan', (r) => formatDateTime(r.created_at)],
          ["To'langan", (r) => (r.paid_at ? formatDateTime(r.paid_at) : '—')],
        ]} />
      )}
      <Pager meta={meta} page={page} setPage={setPage} />
    </Card>
  );
}

function OnlineTab() {
  const live = useLoad(() => adminApi.activeUsers({ minutes: 5 }), []);
  useEffect(() => {
    const id = setInterval(live.reload, 15000);
    return () => clearInterval(id);
  }, [live.reload]);
  const d = live.data;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Onlayn tashrifchilar (5 daq)" icon={Activity} loading={!d && live.loading} value={formatNumber(d?.visitors_online)} hint="har 15 soniyada yangilanadi" />
        <StatCard label="Onlayn foydalanuvchilar" icon={UserCheck} loading={!d && live.loading} value={formatNumber(d?.users_online)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Faol foydalanuvchilar" />
          <SimpleTable loading={!d && live.loading} rows={d?.users} empty="Hozir hech kim yo'q" cols={[
            ['Foydalanuvchi', (r) => <div><div>{r.full_name}</div><div className="text-xs text-zinc-500">{r.email}</div></div>],
            ['Oxirgi', (r) => formatDateTime(r.last_active_at)],
          ]} />
        </Card>
        <Card>
          <CardHeader title="Hozir ochiq sahifalar" />
          <SimpleTable loading={!d && live.loading} rows={d?.current_pages} empty="Hozir hech kim yo'q" cols={[
            ['Sahifa', (r) => <span className="font-mono text-xs">{r.path}</span>],
            ['Tashrifchi', (r) => formatNumber(r.visitors)],
          ]} />
        </Card>
      </div>
    </div>
  );
}

function AuditTab() {
  const [page, setPage] = useState(1);
  const list = useLoad(() => adminApi.auditLog({ page, limit: 30 }), [page]);
  return (
    <Card>
      {list.error ? <ErrorState message={getErrorMessage(list.error)} onRetry={list.reload} /> : (
        <SimpleTable loading={list.loading} rows={list.data?.data} cols={[
          ['Vaqt', (r) => formatDateTime(r.created_at)],
          ['Hodisa', (r) => <Badge tone={r.action === 'admin.login' ? 'success' : r.action.includes('fail') || r.action.includes('refused') ? 'danger' : 'neutral'}>{ACTION_LABEL[r.action] || r.action}</Badge>],
          ['Admin', (r) => r.admin_email || '—'],
          ['Tafsilot', (r) => <span className="text-xs text-zinc-500">{r.details?.email || (r.details && Object.keys(r.details).length ? JSON.stringify(r.details) : '')}</span>],
          ['IP', (r) => r.ip || '—'],
        ]} />
      )}
      <Pager meta={list.data?.meta} page={page} setPage={setPage} />
    </Card>
  );
}

function BackupsTab() {
  const list = useLoad(() => adminApi.backups(), []);
  const [busy, setBusy] = useState('');
  const run = async (key, fn, ok) => {
    setBusy(key);
    try { await fn(); if (ok) toast.success(ok); list.reload(); } catch (err) { toast.error(getErrorMessage(err)); } finally { setBusy(''); }
  };
  const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Zaxira nusxalar (backup)"
        subtitle="Har kuni avtomatik yaratiladi (backend/data/backups, oxirgi 14 tasi saqlanadi). Ma'lumot fayli buzilsa, server ishga tushganda eng yangi nusxadan avtomatik tiklanadi."
        action={<div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={Download} loading={busy === 'dl'} onClick={() => run('dl', adminApi.downloadBackup)}>Yuklab olish (JSON)</Button>
          <Button size="sm" icon={DatabaseBackup} loading={busy === 'new'} onClick={() => run('new', adminApi.createBackup, 'Zaxira nusxa yaratildi')}>Hozir zaxiralash</Button>
        </div>} />
      <div className="mt-3">
        {list.loading ? <TableSkeleton rows={4} /> : list.error ? <ErrorState message={getErrorMessage(list.error)} onRetry={list.reload} />
          : !list.data?.length ? <EmptyState title="Hali zaxira nusxalar yo'q" message="Server ishga tushganda birinchi nusxa yaratiladi." /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Sana</th><th>Papka</th><th className="text-right">Hajmi</th></tr></thead>
                <tbody>
                  {list.data.map((b) => (
                    <tr key={b.name}><td>{formatDateTime(b.created_at)}</td><td className="font-mono text-xs text-zinc-500">data/backups/{b.name}</td><td className="num text-right">{size(b.size_bytes)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </Card>
  );
}

const TABS = [
  { id: 'overview', label: 'Umumiy', icon: LayoutDashboard, el: OverviewTab },
  { id: 'users', label: 'Foydalanuvchilar', icon: Users, el: UsersTab },
  { id: 'payments', label: "To'lovlar", icon: CreditCard, el: PaymentsTab },
  { id: 'online', label: 'Onlayn', icon: Activity, el: OnlineTab },
  { id: 'audit', label: 'Audit', icon: FileClock, el: AuditTab },
  { id: 'backups', label: 'Backup', icon: DatabaseBackup, el: BackupsTab },
];

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [key, setKey] = useState(0);
  const Tab = TABS.find((x) => x.id === tab).el;
  useEffect(() => { document.title = 'OptiSell Admin'; return () => { document.title = 'OptiSell'; }; }, []);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Admin panel</h1>
          <Badge tone="info" icon={ShieldCheck}>Admin</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-zinc-500 sm:inline">{user?.email}</span>
          <Button variant="ghost" size="icon" aria-label="Yangilash" onClick={() => setKey((k) => k + 1)}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={cn('-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium',
              tab === id ? 'border-brand-600 text-brand-700 dark:text-brand-400' : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200')}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </nav>
      <Tab key={`${tab}-${key}`} />
    </div>
  );
}
