import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PASSWORD, api, db, registerUser, startServer, stopServer } from './helpers.js';

before(startServer);
after(stopServer);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (payload, opts = {}, secret = process.env.JWT_SECRET) =>
  jwt.sign(payload, secret, {
    algorithm: 'HS256',
    issuer: 'optisell-api',
    audience: 'optisell-client',
    expiresIn: '1h',
    ...opts,
  });

describe('register', () => {
  it('creates a user, returns a token and never returns the password hash', async () => {
    const email = `New_${randomUUID()}@Test.com`;
    const res = await api('POST', '/api/auth/register', {
      body: { email, password: PASSWORD, full_name: 'Kamron', business_name: 'Shop' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, email.toLowerCase());
    assert.equal(res.body.data.token_type, 'Bearer');
    assert.ok(res.body.data.expires_in > 0);
    assert.equal(res.body.data.user.password_hash, undefined);
    assert.ok(!JSON.stringify(res.body).includes(PASSWORD));

    const stored = db().users.find((u) => u.email === email.toLowerCase());
    assert.match(stored.password_hash, /^\$2[aby]\$/, 'password must be bcrypt-hashed');
  });

  it('rejects duplicate email case-insensitively (409)', async () => {
    const { email } = await registerUser();
    const res = await api('POST', '/api/auth/register', {
      body: { email: email.toUpperCase(), password: PASSWORD, full_name: 'Dup' },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_TAKEN');
  });

  for (const [label, password] of [
    ['too short', 'Ab1'],
    ['no digits', 'abcdefghij'],
    ['no letters', '1234567890'],
    ['over 72 bytes', `A1${'x'.repeat(80)}`],
  ]) {
    it(`rejects weak password: ${label}`, async () => {
      const res = await api('POST', '/api/auth/register', {
        body: { email: `${randomUUID()}@t.com`, password, full_name: 'X Y' },
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });
  }

  it('rejects invalid email and SQL-injection-like email', async () => {
    for (const email of ['not-an-email', "' OR 1=1 --", 'a@b']) {
      const res = await api('POST', '/api/auth/register', {
        body: { email, password: PASSWORD, full_name: 'X Y' },
      });
      assert.equal(res.status, 400, email);
    }
  });

  it('rejects unknown fields (mass assignment, e.g. role/id)', async () => {
    const res = await api('POST', '/api/auth/register', {
      body: { email: `${randomUUID()}@t.com`, password: PASSWORD, full_name: 'X Y', role: 'admin' },
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.some((d) => d.message.toLowerCase().includes('role')));
  });
});

describe('login', () => {
  it('logs in with correct credentials (email case-insensitive)', async () => {
    const { email } = await registerUser();
    const res = await api('POST', '/api/auth/login', {
      body: { email: email.toUpperCase(), password: PASSWORD },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.email, email);
  });

  it('returns the same generic 401 for wrong password and unknown email', async () => {
    const { email } = await registerUser();
    const wrong = await api('POST', '/api/auth/login', { body: { email, password: 'Wrong-pass1' } });
    const unknown = await api('POST', '/api/auth/login', {
      body: { email: `${randomUUID()}@t.com`, password: PASSWORD },
    });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(wrong.body, unknown.body);
    assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS');
  });

  it('rejects SQL injection attempts', async () => {
    const res = await api('POST', '/api/auth/login', {
      body: { email: "admin@x.com' OR '1'='1", password: "' OR '1'='1" },
    });
    assert.equal(res.status, 400);
  });
});

describe('protected routes / JWT', () => {
  it('GET /me returns the current user', async () => {
    const { token, user } = await registerUser();
    const res = await api('GET', '/api/auth/me', { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.id, user.id);
  });

  it('rejects missing and malformed Authorization headers', async () => {
    for (const authorization of [undefined, 'Bearer', 'Basic abc', 'Bearer not.a.jwt!', 'token']) {
      const res = await api('GET', '/api/products', {
        headers: authorization ? { authorization } : {},
      });
      assert.equal(res.status, 401, String(authorization));
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
    }
  });

  it('rejects a tampered token (payload changed, signature kept)', async () => {
    const { token } = await registerUser();
    const other = await registerUser();
    const [h, , s] = token.split('.');
    const forgedPayload = b64({
      sub: other.user.id,
      iss: 'optisell-api',
      aud: 'optisell-client',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const res = await api('GET', '/api/auth/me', { token: `${h}.${forgedPayload}.${s}` });
    assert.equal(res.status, 401);
  });

  it('rejects "alg: none" tokens', async () => {
    const { user } = await registerUser();
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      sub: user.id,
      iss: 'optisell-api',
      aud: 'optisell-client',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.`;
    const res = await api('GET', '/api/auth/me', { token });
    assert.equal(res.status, 401);
  });

  it('rejects tokens signed with another secret, wrong audience, or wrong issuer', async () => {
    const { user } = await registerUser();
    const bad = [
      sign({}, { subject: user.id }, 'x'.repeat(64)),
      sign({}, { subject: user.id, audience: 'someone-else' }),
      sign({}, { subject: user.id, issuer: 'evil' }),
      sign({}, { subject: user.id, algorithm: 'HS512' }),
    ];
    for (const token of bad) {
      const res = await api('GET', '/api/auth/me', { token });
      assert.equal(res.status, 401);
    }
  });

  it('returns TOKEN_EXPIRED for expired tokens', async () => {
    const { user } = await registerUser();
    const token = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      issuer: 'optisell-api',
      audience: 'optisell-client',
      subject: user.id,
    });
    const res = await api('GET', '/api/auth/me', { token });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_EXPIRED');
  });

  it('rejects valid tokens of deleted users', async () => {
    const { token, user } = await registerUser();
    db().users.splice(db().users.findIndex((u) => u.id === user.id), 1);
    const res = await api('GET', '/api/auth/me', { token });
    assert.equal(res.status, 401);
  });

  it('rejects a validly signed token whose subject is not a UUID', async () => {
    const res = await api('GET', '/api/auth/me', { token: sign({}, { subject: "1' OR '1'='1" }) });
    assert.equal(res.status, 401);
  });
});

describe('forgot password', () => {
  it('Telegram code resets the password; wrong codes are limited; unknown emails look the same', async () => {
    const { db: data } = await import('./helpers.js');
    const { outbox } = await import('../src/services/telegram.service.js');
    const { email, user } = await registerUser();
    data().users.find((u) => u.id === user.id).telegram_chat_id = 777;

    const unknown = await api('POST', '/api/auth/password/forgot', { body: { email: 'nobody@test.com' } });
    const known = await api('POST', '/api/auth/password/forgot', { body: { email } });
    assert.deepEqual(unknown.body, known.body);
    const code = /<b>(\d{6})<\/b>/.exec(outbox.filter((m) => m.chat_id === 777).at(-1).text)[1];

    const wrong = await api('POST', '/api/auth/password/reset', { body: { email, code: code === '000000' ? '111111' : '000000', new_password: 'NewPassw0rd' } });
    assert.equal(wrong.body.error.code, 'INVALID_RESET_CODE');
    const ok = await api('POST', '/api/auth/password/reset', { body: { email, code, new_password: 'NewPassw0rd' } });
    assert.equal(ok.status, 200);
    assert.equal((await api('POST', '/api/auth/login', { body: { email, password: 'NewPassw0rd' } })).status, 200);
    // single use
    assert.equal((await api('POST', '/api/auth/password/reset', { body: { email, code, new_password: 'Other1234x' } })).status, 400);
  });

  it('admin reset link works once', async () => {
    const { createResetLink } = await import('../src/services/passwordReset.service.js');
    const { email, user } = await registerUser();
    const token = createResetLink(user.id).path.split('token=')[1];
    const ok = await api('POST', '/api/auth/password/reset-link', { body: { token, new_password: 'Fresh1234pw' } });
    assert.equal(ok.body.data.email, email);
    assert.equal((await api('POST', '/api/auth/password/reset-link', { body: { token, new_password: 'Fresh1234pw' } })).status, 400);
  });
});
