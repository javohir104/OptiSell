/**
 * Payme Merchant API (https://developer.help.paycom.uz/protokol-merchant-api/).
 *
 * The user is sent to checkout.paycom.uz with account.order_id = our order number. Payme then calls
 * POST /api/payments/payme (JSON-RPC 2.0, Basic auth "Paycom:<PAYME_KEY>") with the methods below.
 * Amounts are in tiyin (1 so'm = 100 tiyin).
 */
import { timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { db, update } from '../../db/store.js';
import { findPayment, markPaid } from '../subscription.service.js';

export const paymeConfigured = () => Boolean(env.PAYME_MERCHANT_ID && env.PAYME_KEY);

export function paymeCheckoutUrl({ orderNo, amount, returnUrl }) {
  const params = `m=${env.PAYME_MERCHANT_ID};ac.order_id=${orderNo};a=${Math.round(Number(amount) * 100)};c=${returnUrl}`;
  const host = env.PAYME_TEST ? 'https://checkout.test.paycom.uz' : 'https://checkout.paycom.uz';
  return `${host}/${Buffer.from(params).toString('base64')}`;
}

const TXN_TIMEOUT_MS = 12 * 60 * 60 * 1000;

const msg = (en, ru, uz) => ({ en, ru, uz });
class RpcError extends Error {
  constructor(code, message, data) {
    super(message.en);
    this.code = code;
    this.rpcMessage = message;
    this.data = data;
  }
}

const E = {
  auth: () => new RpcError(-32504, msg('Unauthorized', 'Недостаточно привилегий', "Ruxsat yo'q")),
  method: () => new RpcError(-32601, msg('Method not found', 'Метод не найден', 'Metod topilmadi')),
  request: () => new RpcError(-32600, msg('Invalid request', 'Неверный запрос', "Noto'g'ri so'rov")),
  amount: () => new RpcError(-31001, msg('Wrong amount', 'Неверная сумма', "Noto'g'ri summa")),
  order: () => new RpcError(-31050, msg('Order not found', 'Заказ не найден', 'Buyurtma topilmadi'), 'order_id'),
  orderBusy: () =>
    new RpcError(-31051, msg('Order is already being paid', 'Заказ уже оплачивается', "Buyurtma allaqachon to'lanmoqda"), 'order_id'),
  orderPaid: () => new RpcError(-31052, msg('Order already paid', 'Заказ уже оплачен', "Buyurtma allaqachon to'langan"), 'order_id'),
  txn: () => new RpcError(-31003, msg('Transaction not found', 'Транзакция не найдена', 'Tranzaksiya topilmadi')),
  cannotPerform: () =>
    new RpcError(-31008, msg('Cannot perform operation', 'Невозможно выполнить операцию', "Amalni bajarib bo'lmaydi")),
  cannotCancel: () =>
    new RpcError(-31007, msg('Order completed, cannot cancel', 'Заказ выполнен, отмена невозможна', "Buyurtma bajarilgan, bekor qilib bo'lmaydi")),
};

function authorized(header) {
  const m = /^Basic\s+(.+)$/i.exec(header || '');
  if (!m) return false;
  const given = Buffer.from(Buffer.from(m[1], 'base64').toString('utf8'));
  const expected = Buffer.from(`Paycom:${env.PAYME_KEY}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function orderFor(account) {
  const id = String(account?.order_id ?? '');
  if (!/^\d{1,18}$/.test(id)) throw E.order();
  const order = findPayment((p) => p.provider === 'payme' && p.order_no === Number(id));
  if (!order) throw E.order();
  return order;
}

const findTxn = (id) => findPayment((p) => p.provider === 'payme' && p.provider_txn_id === String(id ?? ''));

function txnById(id) {
  const t = findTxn(id);
  if (!t) throw E.txn();
  return t;
}

/** Cancel a transaction that was not performed within TXN_TIMEOUT_MS. */
const expire = (t) =>
  update('payments', t, { provider_state: -1, cancel_reason: 4, txn_cancel_time: Date.now(), status: 'cancelled' });

const tiyin = (order) => Math.round(Number(order.amount) * 100);
const n = (v) => (v === null || v === undefined ? 0 : Number(v));

const txnResult = (t) => ({
  create_time: n(t.txn_create_time),
  perform_time: n(t.txn_perform_time),
  cancel_time: n(t.txn_cancel_time),
  transaction: t.id,
  state: t.provider_state,
  reason: t.cancel_reason ?? null,
});

function checkOrder(params) {
  const order = orderFor(params.account);
  if (Number(params.amount) !== tiyin(order)) throw E.amount();
  if (order.status === 'paid') throw E.orderPaid();
  if (order.status === 'cancelled') throw E.order();
  return order;
}

const methods = {
  async CheckPerformTransaction(params) {
    checkOrder(params);
    return { allow: true };
  },

  async CreateTransaction(params) {
    const t = findTxn(params.id);
    if (t) {
      if (t.provider_state !== 1) throw E.cannotPerform();
      if (Date.now() - n(t.txn_create_time) > TXN_TIMEOUT_MS) {
        expire(t);
        throw E.cannotPerform();
      }
      return { create_time: n(t.txn_create_time), transaction: t.id, state: 1 };
    }

    const order = checkOrder(params);
    if (order.provider_txn_id) throw E.orderBusy();
    const time = Number(params.time) || Date.now();
    update('payments', order, { provider_txn_id: String(params.id), provider_state: 1, txn_create_time: time });
    return { create_time: time, transaction: order.id, state: 1 };
  },

  async PerformTransaction(params) {
    const t = txnById(params.id);
    if (t.provider_state === 2) return { transaction: t.id, perform_time: n(t.txn_perform_time), state: 2 };
    if (t.provider_state !== 1) throw E.cannotPerform();
    if (Date.now() - n(t.txn_create_time) > TXN_TIMEOUT_MS) {
      expire(t);
      throw E.cannotPerform();
    }
    const time = Date.now();
    update('payments', t, { provider_state: 2, txn_perform_time: time });
    markPaid(t.id);
    return { transaction: t.id, perform_time: time, state: 2 };
  },

  async CancelTransaction(params) {
    const t = txnById(params.id);
    if (t.provider_state === -1 || t.provider_state === -2) {
      return { transaction: t.id, cancel_time: n(t.txn_cancel_time), state: t.provider_state };
    }
    // The subscription has already been delivered; refunds are handled manually.
    if (t.provider_state === 2) throw E.cannotCancel();
    const time = Date.now();
    update('payments', t, {
      provider_state: -1,
      cancel_reason: Number(params.reason) || null,
      txn_cancel_time: time,
      status: 'cancelled',
    });
    return { transaction: t.id, cancel_time: time, state: -1 };
  },

  async CheckTransaction(params) {
    return txnResult(txnById(params.id));
  },

  async GetStatement(params) {
    const from = Number(params.from) || 0;
    const to = Number(params.to) || 0;
    const rows = db.payments
      .filter((p) => p.provider === 'payme' && p.provider_txn_id && p.txn_create_time >= from && p.txn_create_time <= to)
      .sort((a, b) => a.txn_create_time - b.txn_create_time);
    return {
      transactions: rows.map((t) => ({
        id: t.provider_txn_id,
        time: n(t.txn_create_time),
        amount: tiyin(t),
        account: { order_id: String(t.order_no) },
        ...txnResult(t),
      })),
    };
  },
};

/** Handle one Payme JSON-RPC request. Payme expects HTTP 200 with the error inside the body. */
export async function handlePayme(body, authHeader) {
  const id = body?.id ?? null;
  try {
    if (!paymeConfigured() || !authorized(authHeader)) throw E.auth();
    if (!body || typeof body.method !== 'string') throw E.request();
    const fn = Object.hasOwn(methods, body.method) ? methods[body.method] : null;
    if (!fn) throw E.method();
    return { jsonrpc: '2.0', id, result: await fn(body.params ?? {}) };
  } catch (err) {
    if (err instanceof RpcError) {
      return { jsonrpc: '2.0', id, error: { code: err.code, message: err.rpcMessage, data: err.data } };
    }
    console.error('Payme handler error:', err);
    return { jsonrpc: '2.0', id, error: { code: -32400, message: msg('System error', 'Системная ошибка', 'Tizim xatosi') } };
  }
}
