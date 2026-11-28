/**
 * Telegram notifications (Max plan): a daily report and low-stock alerts sent by the OptiSell bot.
 *
 * Linking a chat to an account:
 *   1. The owner presses "Connect Telegram" -> POST /api/telegram/link returns t.me/<bot>?start=link_<code>
 *   2. The bot receives "/start link_<code>" and calls POST /api/telegram/bot/link with the shared
 *      TELEGRAM_LINK_SECRET, the code and its chat id -> the chat is saved on the account.
 *
 * Messages are sent straight to the Bot API with TELEGRAM_BOT_TOKEN (the same bot). A failed send
 * never breaks the request that caused it. In tests nothing is sent; messages go to `outbox`.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { hasFeature } from '../config/plans.js';
import { db, now, update } from '../db/store.js';
import { AppError } from '../utils/AppError.js';
import { localDay, today } from '../utils/dates.js';
import { cents, fromCents } from '../utils/money.js';
import { findUser, isStaff } from './user.shared.js';

const LINK_TTL_MS = 15 * 60_000;
const isTest = env.NODE_ENV === 'test';

/** Messages "sent" in tests: [{ chat_id, text }]. */
export const outbox = [];

export const telegramConfigured = () => Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME);

async function sendMessage(chatId, text) {
  if (isTest) {
    outbox.push({ chat_id: chatId, text });
    return true;
  }
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      console.error(`Telegram send failed: ${data.description ?? res.status}`);
      // The user blocked the bot or deleted the chat: stop trying.
      if (res.status === 403) {
        const user = db.users.find((u) => u.telegram_chat_id === chatId);
        if (user) update('users', user, { telegram_chat_id: null }, { touch: false });
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Telegram send failed: ${err.message}`);
    return false;
  }
}

/** Plain message to a chat (used by password reset). Returns true when sent. */
export const sendTelegramText = (chatId, text) => sendMessage(chatId, text);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sum = (value) => `${Math.round(Number(value)).toLocaleString('ru-RU').replace(/,/g, ' ')} so'm`;

/* ------------------------------------------------------------------ texts */

const T = {
  uz: {
    linked: (name) => `✅ <b>${esc(name)}</b> akkaunti ulandi.\n\nHar kuni kechqurun hisobot va tovar kam qolganda ogohlantirish shu yerga keladi.`,
    test: '🔔 Sinov xabari: OptiSell xabarnomalari ishlayapti.',
    low: (p) => `⚠️ <b>Kam qoldi:</b> ${esc(p.name)} — ${p.quantity} ${esc(p.unit)} (minimum ${p.low_stock_threshold})`,
    out: (p) => `❌ <b>Tugadi:</b> ${esc(p.name)} (${esc(p.sku)})`,
    title: (shop, day) => `📊 <b>${esc(shop)}</b> — kunlik hisobot\n🗓 ${day}`,
    revenue: 'Tushum', sales: 'Sotuvlar', profit: 'Yalpi foyda', expenses: 'Xarajatlar', net: 'Sof foyda',
    returns: 'Qaytarishlar', top: '🏆 Eng ko\'p sotilganlar', lowList: '📦 Kam qolgan tovarlar',
    debts: '💳 Nasiya', debtTotal: 'Jami qarz', overdue: 'Muddati o\'tgan', dueSoon: '⏰ Yaqinda to\'lashi kerak',
    noSales: 'Bugun sotuv bo\'lmadi.', more: (n) => `… va yana ${n} ta`,
  },
  ru: {
    linked: (name) => `✅ Аккаунт <b>${esc(name)}</b> подключён.\n\nКаждый вечер сюда будет приходить отчёт, а также оповещения, когда товар заканчивается.`,
    test: '🔔 Тестовое сообщение: уведомления OptiSell работают.',
    low: (p) => `⚠️ <b>Заканчивается:</b> ${esc(p.name)} — ${p.quantity} ${esc(p.unit)} (минимум ${p.low_stock_threshold})`,
    out: (p) => `❌ <b>Закончился:</b> ${esc(p.name)} (${esc(p.sku)})`,
    title: (shop, day) => `📊 <b>${esc(shop)}</b> — отчёт за день\n🗓 ${day}`,
    revenue: 'Выручка', sales: 'Продажи', profit: 'Валовая прибыль', expenses: 'Расходы', net: 'Чистая прибыль',
    returns: 'Возвраты', top: '🏆 Хиты продаж', lowList: '📦 Заканчиваются',
    debts: '💳 Долги (насия)', debtTotal: 'Всего долгов', overdue: 'Просрочено', dueSoon: '⏰ Скоро срок оплаты',
    noSales: 'Сегодня продаж не было.', more: (n) => `… и ещё ${n}`,
  },
  en: {
    linked: (name) => `✅ Account <b>${esc(name)}</b> connected.\n\nYou will get a report here every evening and an alert when a product runs low.`,
    test: '🔔 Test message: OptiSell notifications work.',
    low: (p) => `⚠️ <b>Running low:</b> ${esc(p.name)} — ${p.quantity} ${esc(p.unit)} (minimum ${p.low_stock_threshold})`,
    out: (p) => `❌ <b>Out of stock:</b> ${esc(p.name)} (${esc(p.sku)})`,
    title: (shop, day) => `📊 <b>${esc(shop)}</b> — daily report\n🗓 ${day}`,
    revenue: 'Revenue', sales: 'Sales', profit: 'Gross profit', expenses: 'Expenses', net: 'Net profit',
    returns: 'Returns', top: '🏆 Best sellers', lowList: '📦 Running low',
    debts: '💳 Customer debts', debtTotal: 'Total owed', overdue: 'Overdue', dueSoon: '⏰ Due soon',
    noSales: 'No sales today.', more: (n) => `… and ${n} more`,
  },
};

const textsFor = (user) => T[user.telegram_lang] ?? T.uz;

/** Owner accounts that should get Telegram messages now. */
function canNotify(user, flag) {
  return Boolean(user?.telegram_chat_id) && !isStaff(user) && user[flag] !== false && hasFeature(user, 'telegram');
}

/* ------------------------------------------------------------------ linking */

export function startLink(userId) {
  const user = findUser(userId);
  const code = randomBytes(12).toString('hex');
  update('users', user, { telegram_link_code: code, telegram_link_expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString() }, { touch: false });
  return {
    configured: telegramConfigured(),
    url: telegramConfigured() ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=link_${code}` : null,
    code,
    expires_in: LINK_TTL_MS / 1000,
  };
}

export function unlink(userId) {
  const user = findUser(userId);
  update('users', user, { telegram_chat_id: null, telegram_link_code: null }, { touch: false });
  return { connected: false };
}

export function assertBotSecret(given) {
  const expected = env.TELEGRAM_LINK_SECRET;
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw AppError.unauthorized('Invalid bot secret');
  }
}

/** Called by the bot: bind a chat to the account that created `code`. */
export async function completeLink({ code, chat_id, language_code }) {
  const user = db.users.find((u) => u.telegram_link_code === code);
  if (!user || !user.telegram_link_expires_at || Date.parse(user.telegram_link_expires_at) < Date.now()) {
    throw new AppError(400, 'LINK_EXPIRED', 'This link has expired. Press "Connect Telegram" in OptiSell again.');
  }
  // One chat = one account: move the chat off any other account first.
  for (const other of db.users.filter((u) => u.telegram_chat_id === chat_id && u.id !== user.id)) {
    update('users', other, { telegram_chat_id: null }, { touch: false });
  }
  const lang = ['uz', 'ru', 'en'].includes(language_code) ? language_code : 'uz';
  update('users', user, { telegram_chat_id: chat_id, telegram_lang: lang, telegram_link_code: null, telegram_linked_at: now() }, { touch: false });
  await sendMessage(chat_id, textsFor(user).linked(user.business_name || user.full_name));
  return { linked: true, name: user.business_name || user.full_name };
}

/** Called by the bot on /stop: the chat no longer wants messages. */
export function unlinkChat(chatId) {
  const users = db.users.filter((u) => u.telegram_chat_id === chatId);
  for (const u of users) update('users', u, { telegram_chat_id: null }, { touch: false });
  return { unlinked: users.length };
}

export async function sendTest(userId) {
  const user = findUser(userId);
  if (!user.telegram_chat_id) throw new AppError(400, 'TELEGRAM_NOT_LINKED', 'Connect Telegram first');
  const ok = await sendMessage(user.telegram_chat_id, textsFor(user).test);
  if (!ok) throw new AppError(502, 'TELEGRAM_SEND_FAILED', 'Could not send the message. Check the bot settings.');
  return { sent: true };
}

/* ------------------------------------------------------------------ low stock */

/** Called after every stock change: alerts when a product drops to its minimum (or runs out). */
export function onStockChange(product, before) {
  const after = product.quantity;
  const crossedLow = before > product.low_stock_threshold && after <= product.low_stock_threshold;
  const ranOut = before > 0 && after === 0;
  if (!crossedLow && !ranOut) return;
  const owner = findUser(product.user_id);
  if (!canNotify(owner, 'notify_low_stock')) return;
  const t = textsFor(owner);
  sendMessage(owner.telegram_chat_id, after === 0 ? t.out(product) : t.low(product)).catch(() => {});
}

/* ------------------------------------------------------------------ daily report */

/** Report text for one owner and day (exported for tests and the "send now" button). */
export async function buildDailyReport(user, day = today()) {
  // Lazy imports: these services import modules that import this one.
  const { getOverview, getTopProducts } = await import('./dashboard.service.js');
  const { debtSummary, dueSoon } = await import('./customer.service.js');
  const t = textsFor(user);
  const o = await getOverview(user.id, { from: day, to: day });
  const top = await getTopProducts(user.id, { from: day, to: day, by: 'revenue', order: 'desc', limit: 3 });
  const returns = db.sales
    .filter((s) => s.user_id === user.id)
    .flatMap((s) => s.returns ?? [])
    .filter((r) => localDay(r.created_at) === day);

  const lines = [t.title(user.business_name || user.full_name, day), ''];
  if (!o.sales.count) lines.push(t.noSales);
  lines.push(
    `💰 ${t.revenue}: <b>${sum(o.profit.revenue)}</b>`,
    `🛒 ${t.sales}: <b>${o.sales.count}</b>`,
    `📈 ${t.profit}: <b>${sum(o.profit.gross_profit)}</b>`,
    `🧾 ${t.expenses}: <b>${sum(o.profit.expenses)}</b>`,
    `✅ ${t.net}: <b>${sum(o.profit.net_profit)}</b>`,
  );
  if (returns.length) lines.push(`↩️ ${t.returns}: <b>${returns.length}</b> (${sum(fromCents(returns.reduce((s, r) => s + cents(r.amount), 0)))})`);

  if (top.items.length) {
    lines.push('', `<b>${t.top}</b>`);
    top.items.forEach((p, i) => lines.push(`${i + 1}. ${esc(p.name)} — ${p.quantity_sold} × · ${sum(p.revenue)}`));
  }

  const low = db.products
    .filter((p) => p.user_id === user.id && p.is_active && p.quantity <= p.low_stock_threshold)
    .sort((a, b) => a.quantity - b.quantity);
  if (low.length) {
    lines.push('', `<b>${t.lowList}</b>`);
    low.slice(0, 7).forEach((p) => lines.push(`• ${esc(p.name)} — ${p.quantity} ${esc(p.unit)}`));
    if (low.length > 7) lines.push(t.more(low.length - 7));
  }

  if (hasFeature(user, 'debts')) {
    const d = debtSummary(user.id);
    if (d.total_debt > 0) {
      lines.push('', `<b>${t.debts}</b>`, `${t.debtTotal}: <b>${sum(fromCents(d.total_debt))}</b>`);
      if (d.overdue_amount > 0) lines.push(`${t.overdue}: <b>${sum(fromCents(d.overdue_amount))}</b> (${d.overdue_customers})`);
      const soon = dueSoon(user.id, 2);
      if (soon.length) {
        lines.push(`<b>${t.dueSoon}</b>`);
        soon.slice(0, 5).forEach((c) => lines.push(`• ${esc(c.name)}${c.phone ? ` (${esc(c.phone)})` : ''} — ${sum(fromCents(c.balance))}, ${c.next_due_date}`));
      }
    }
  }
  return lines.join('\n');
}

/** Send today's report to everyone who should get it and has not got it yet. */
export async function sendDueReports(nowDate = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: env.APP_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(nowDate),
  );
  if (hour < env.DAILY_REPORT_HOUR) return 0;
  const day = today();
  let sent = 0;
  for (const user of db.users.filter((u) => canNotify(u, 'notify_daily_report') && u.last_report_day !== day)) {
    // Mark first: a slow or failing send is never repeated every minute.
    update('users', user, { last_report_day: day }, { touch: false });
    if (await sendMessage(user.telegram_chat_id, await buildDailyReport(user, day))) sent += 1;
  }
  return sent;
}

export async function sendReportNow(userId) {
  const user = findUser(userId);
  if (!user.telegram_chat_id) throw new AppError(400, 'TELEGRAM_NOT_LINKED', 'Connect Telegram first');
  const ok = await sendMessage(user.telegram_chat_id, await buildDailyReport(user));
  if (!ok) throw new AppError(502, 'TELEGRAM_SEND_FAILED', 'Could not send the message. Check the bot settings.');
  return { sent: true };
}

export function startReportSchedule() {
  if (isTest || !env.TELEGRAM_BOT_TOKEN) return;
  setInterval(() => {
    sendDueReports().catch((err) => console.error(`Daily reports failed: ${err.message}`));
  }, 60_000).unref();
}

export function status(userId) {
  const user = findUser(userId);
  return {
    configured: telegramConfigured(),
    connected: Boolean(user.telegram_chat_id),
    bot_username: env.TELEGRAM_BOT_USERNAME || null,
    notify_daily_report: user.notify_daily_report !== false,
    notify_low_stock: user.notify_low_stock !== false,
    report_hour: env.DAILY_REPORT_HOUR,
  };
}
