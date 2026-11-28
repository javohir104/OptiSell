/**
 * Click SHOP API (https://docs.click.uz/click-api-request/).
 *
 * Flow: the user is sent to my.click.uz with our order number (merchant_trans_id). Click then calls
 *   POST /api/payments/click/prepare   (action=0) — can this order be paid?
 *   POST /api/payments/click/complete  (action=1) — money taken (error=0) or payment failed (error<0)
 * Both requests are signed with md5 and CLICK_SECRET_KEY.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { update } from '../../db/store.js';
import { findPayment, markPaid } from '../subscription.service.js';

export const clickConfigured = () => Boolean(env.CLICK_SERVICE_ID && env.CLICK_MERCHANT_ID && env.CLICK_SECRET_KEY);

export function clickCheckoutUrl({ orderNo, amount, returnUrl }) {
  const url = new URL('https://my.click.uz/services/pay');
  url.searchParams.set('service_id', env.CLICK_SERVICE_ID);
  url.searchParams.set('merchant_id', env.CLICK_MERCHANT_ID);
  url.searchParams.set('amount', Number(amount).toFixed(2));
  url.searchParams.set('transaction_param', String(orderNo));
  url.searchParams.set('return_url', returnUrl);
  return url.toString();
}

const ERR = {
  OK: [0, 'Success'],
  SIGN: [-1, 'SIGN CHECK FAILED!'],
  AMOUNT: [-2, 'Incorrect parameter amount'],
  ACTION: [-3, 'Action not found'],
  PAID: [-4, 'Already paid'],
  ORDER: [-5, 'Order not found'],
  TXN: [-6, 'Transaction does not exist'],
  REQUEST: [-8, 'Error in request from click'],
  CANCELLED: [-9, 'Transaction cancelled'],
};

const md5 = (s) => createHash('md5').update(s).digest('hex');

function signValid(b, action) {
  const parts = [
    b.click_trans_id,
    b.service_id,
    env.CLICK_SECRET_KEY,
    b.merchant_trans_id,
    action === 1 ? b.merchant_prepare_id : '',
    b.amount,
    b.action,
    b.sign_time,
  ];
  const expected = Buffer.from(md5(parts.join('')));
  const given = Buffer.from(String(b.sign_string || ''));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function findOrder(merchantTransId) {
  if (!/^\d{1,18}$/.test(String(merchantTransId ?? ''))) return null;
  return findPayment((p) => p.provider === 'click' && p.order_no === Number(merchantTransId));
}

/** Handle a Click prepare (action 0) or complete (action 1) request. Always returns a JSON body. */
export async function handleClick(body, expectedAction) {
  const b = body ?? {};
  const reply = ([error, error_note], extra = {}) => ({
    click_trans_id: b.click_trans_id,
    merchant_trans_id: b.merchant_trans_id,
    ...extra,
    error,
    error_note,
  });

  if (!clickConfigured()) return reply(ERR.REQUEST);
  const action = Number(b.action);
  if (action !== expectedAction) return reply(ERR.ACTION);
  const required = ['click_trans_id', 'service_id', 'merchant_trans_id', 'amount', 'sign_time', 'sign_string'];
  if (required.some((k) => b[k] === undefined || b[k] === '')) return reply(ERR.REQUEST);
  if (!signValid(b, action)) return reply(ERR.SIGN);
  if (String(b.service_id) !== String(env.CLICK_SERVICE_ID)) return reply(ERR.REQUEST);

  const order = findOrder(b.merchant_trans_id);
  if (!order) return reply(ERR.ORDER);
  if (Math.abs(Number(b.amount) - Number(order.amount)) > 0.01) return reply(ERR.AMOUNT);

  const ids = { merchant_prepare_id: Number(order.order_no) };

  if (action === 0) {
    if (order.status === 'paid') return reply(ERR.PAID, ids);
    if (order.status === 'cancelled') return reply(ERR.CANCELLED, ids);
    update('payments', order, { provider_txn_id: String(b.click_trans_id) });
    return reply(ERR.OK, ids);
  }

  // complete
  if (String(b.merchant_prepare_id) !== String(order.order_no)) return reply(ERR.TXN);
  if (order.provider_txn_id && order.provider_txn_id !== String(b.click_trans_id)) return reply(ERR.TXN);
  const confirm = { merchant_confirm_id: Number(order.order_no) };
  if (order.status === 'paid') return reply(ERR.PAID, confirm);
  if (order.status === 'cancelled') return reply(ERR.CANCELLED, confirm);

  if (Number(b.error) < 0) {
    update('payments', order, { status: 'cancelled' }); // status is 'pending' here (checked above)
    return reply(ERR.CANCELLED, confirm);
  }

  markPaid(order.id);
  return reply(ERR.OK, confirm);
}
