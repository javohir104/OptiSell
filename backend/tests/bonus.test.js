import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, createProduct, createSale, db, registerUser, startServer, stopServer } from './helpers.js';

before(startServer);
after(stopServer);

const balance = async (token) => (await api('GET', '/api/bonus', { token })).body.data.balance;

describe('bonus points', () => {
  it('referral: +15 only when the friend has a real shop, +30 / +50 when the friend pays', async () => {
    const inviter = await registerUser();
    const code = (await api('GET', '/api/bonus', { token: inviter.token })).body.data.referral_code;
    assert.match(code, /^[A-Z2-9]{7}$/);

    const friend = await registerUser({ referral_code: code, business_name: "Do'kon" });
    assert.equal(await balance(inviter.token), 0);

    // 5 products + 3 sales = an active shop
    const products = [];
    for (let i = 0; i < 5; i++) products.push(await createProduct(friend.token));
    await createSale(friend.token, [{ product_id: products[0].id, quantity: 1 }]);
    await createSale(friend.token, [{ product_id: products[1].id, quantity: 1 }]);
    assert.equal(await balance(inviter.token), 0);
    await createSale(friend.token, [{ product_id: products[2].id, quantity: 1 }]);
    assert.equal(await balance(inviter.token), 15);
    await createSale(friend.token, [{ product_id: products[3].id, quantity: 1 }]);
    assert.equal(await balance(inviter.token), 15); // only once

    const { markPaid } = await import('../src/services/subscription.service.js');
    const { insert } = await import('../src/db/store.js');
    const pay = (plan) => insert('payments', { order_no: Date.now() % 1e9, user_id: friend.user.id, plan, months: 1, amount: '1.00', provider: 'click', status: 'pending' });
    markPaid(pay('pro').id);
    assert.equal(await balance(inviter.token), 45);
    markPaid(pay('max').id);
    assert.equal(await balance(inviter.token), 95);

    const ov = (await api('GET', '/api/bonus', { token: inviter.token })).body.data;
    assert.equal(ov.referrals.length, 1);
    assert.equal(ov.referrals[0].active, true);
    assert.equal(ov.referrals[0].points_earned, 95);
  });

  it('the buyer gets +30 for Pro and +50 for Max; points / contest plans earn nothing', async () => {
    const buyer = await registerUser();
    const { markPaid } = await import('../src/services/subscription.service.js');
    const { insert } = await import('../src/db/store.js');
    const pay = (plan, provider = 'click') => insert('payments', { order_no: Date.now() % 1e9, user_id: buyer.user.id, plan, months: 1, amount: '1.00', provider, status: 'pending' });
    const pro = pay('pro');
    markPaid(pro.id);
    assert.equal(await balance(buyer.token), 30);
    markPaid(pro.id); // already paid: nothing twice
    assert.equal(await balance(buyer.token), 30);
    markPaid(pay('max').id);
    assert.equal(await balance(buyer.token), 80);
    markPaid(pay('pro', 'points').id);
    assert.equal(await balance(buyer.token), 80);
    const types = (await api('GET', '/api/bonus', { token: buyer.token })).body.data.history.map((h) => h.type).sort();
    assert.deepEqual(types, ['plan_max', 'plan_pro']);
  });

  it('daily revenue over 1.5 mln (after the day, net of returns) gives +10 once', async () => {
    const { awardDailyRevenue } = await import('../src/services/bonus.service.js');
    const u = await registerUser();
    const p = await createProduct(u.token, { selling_price: '800000', initial_quantity: 10 });
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    await createSale(u.token, [{ product_id: p.id, quantity: 2 }], { sold_at: yesterday });
    awardDailyRevenue();
    awardDailyRevenue();
    assert.equal(await balance(u.token), 10);

    const v = await registerUser();
    const q = await createProduct(v.token, { selling_price: '800000', initial_quantity: 10 });
    const sale = (await createSale(v.token, [{ product_id: q.id, quantity: 2 }], { sold_at: yesterday })).body.data;
    await api('POST', `/api/sales/${sale.id}/return`, { token: v.token, body: { items: [{ product_id: q.id, quantity: 1 }] } });
    awardDailyRevenue();
    assert.equal(await balance(v.token), 0);
  });

  it('399 points buy a month of Pro, 699 a month of Max', async () => {
    const u = await registerUser();
    const row = db().users.find((x) => x.id === u.user.id);
    row.plan = 'free';
    row.plan_expires_at = null;
    const { insert } = await import('../src/db/store.js');
    const res0 = await api('POST', '/api/bonus/redeem', { token: u.token, body: { plan: 'pro' } });
    assert.equal(res0.body.error.code, 'NOT_ENOUGH_POINTS');

    insert('points_ledger', { user_id: u.user.id, points: 1100, type: 'admin', key: `t:${u.user.id}` });
    const pro = await api('POST', '/api/bonus/redeem', { token: u.token, body: { plan: 'pro' } });
    assert.equal(pro.status, 200, JSON.stringify(pro.body));
    assert.equal(pro.body.data.balance, 701);
    assert.equal((await api('GET', '/api/auth/me', { token: u.token })).body.data.user.subscription.plan, 'pro');

    const max = await api('POST', '/api/bonus/redeem', { token: u.token, body: { plan: 'max' } });
    assert.equal(max.body.data.balance, 2);
    assert.equal((await api('GET', '/api/auth/me', { token: u.token })).body.data.user.subscription.plan, 'max');
    const pays = (await api('GET', '/api/billing/payments', { token: u.token })).body.data;
    assert.ok(pays.every((p) => p.provider === 'points' && p.status === 'paid'));
  });
});

describe('monthly contest', () => {
  it('ranks by points earned this month, shows my place, gives the winner Pro once', async () => {
    const { insert } = await import('../src/db/store.js');
    const bonus = await import('../src/services/bonus.service.js');
    const month = '2031-05';
    const day = '2031-05-10';
    const a = await registerUser();
    const b = await registerUser();
    const c = await registerUser();
    insert('points_ledger', { user_id: a.user.id, points: 40, type: 'daily_revenue', key: `c1:${a.user.id}`, day });
    insert('points_ledger', { user_id: b.user.id, points: 65, type: 'referral_max', key: `c2:${b.user.id}`, day });
    insert('points_ledger', { user_id: c.user.id, points: 10, type: 'daily_revenue', key: `c3:${c.user.id}`, day });
    insert('points_ledger', { user_id: b.user.id, points: -399, type: 'redeem_pro', key: `c4:${b.user.id}`, day }); // spending does not lower the rank

    const res = await api('GET', `/api/bonus/contest?month=${month}`, { token: a.token });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const top = res.body.data.top.filter((r) => [a, b, c].some((u) => r.points));
    assert.equal(res.body.data.top[0].points, 65);
    assert.equal(res.body.data.me.rank, 2);
    assert.equal(res.body.data.me.points, 40);
    assert.equal(res.body.data.me.to_first, 26);
    assert.ok(top.length >= 3);

    const row = db().users.find((u) => u.id === b.user.id);
    row.plan = 'free';
    row.plan_expires_at = null;
    const won = await bonus.awardMonthlyWinner(month);
    assert.equal(won.user_id, b.user.id);
    assert.equal(await bonus.awardMonthlyWinner(month), null); // only once
    assert.equal((await api('GET', '/api/auth/me', { token: b.token })).body.data.user.subscription.plan, 'pro');
  });
});
