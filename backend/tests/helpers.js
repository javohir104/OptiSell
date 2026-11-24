import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

let server;
let baseUrl;
let pool;

/** Start the real Express app on a random port (import is lazy so tests can tweak env first). */
export async function startServer() {
  const { createApp } = await import('../src/app.js');
  ({ pool } = await import('../src/config/db.js'));
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

export async function stopServer() {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}

/** Direct DB access for assertions. */
export function db() {
  return pool;
}

export async function api(method, path, { token, body, headers = {}, rawBody } = {}) {
  const hasBody = body !== undefined || rawBody !== undefined;
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}

export const PASSWORD = 'Passw0rd-strong';

export async function registerUser(overrides = {}) {
  const email = `user_${randomUUID()}@test.com`;
  const res = await api('POST', '/api/auth/register', {
    body: { email, password: PASSWORD, full_name: 'Test User', ...overrides },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { token: res.body.data.token, user: res.body.data.user, email };
}

export const uniqueSku = (prefix = 'SKU') => `${prefix}-${randomUUID().slice(0, 8)}`;

export async function createProduct(token, overrides = {}) {
  const res = await api('POST', '/api/products', {
    token,
    body: {
      sku: uniqueSku(),
      name: 'Test product',
      cost_price: '10.00',
      selling_price: '25.00',
      initial_quantity: 10,
      ...overrides,
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

export async function createSale(token, items, extraBody = {}, headers = {}) {
  return api('POST', '/api/sales', { token, body: { items, ...extraBody }, headers });
}

export async function stockOf(token, productId) {
  const res = await api('GET', `/api/inventory/${productId}`, { token });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data.quantity;
}
