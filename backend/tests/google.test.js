import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';

const { api, db, PASSWORD, registerUser, startServer, stopServer } = await import('./helpers.js');
const { setGoogleVerifier } = await import('../src/services/google.service.js');

const CREDENTIAL = 'x'.repeat(40);

/** Pretend Google verified a token for this profile. */
function googleSays(profile) {
  setGoogleVerifier(async (token) => {
    assert.equal(token, CREDENTIAL);
    return { email_verified: true, name: 'Ali Valiyev', given_name: 'Ali', family_name: 'Valiyev', ...profile };
  });
}

const signIn = () => api('POST', '/api/auth/google', { body: { credential: CREDENTIAL } });

before(startServer);
afterEach(() => setGoogleVerifier(null));
after(stopServer);

describe('Sign in with Google', () => {
  it('creates a new account with role user and a Pro trial', async () => {
    const email = `g_${randomUUID().slice(0, 8)}@gmail.com`;
    googleSays({ sub: `g-${randomUUID()}`, email });
    const res = await signIn();
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.user.email, email);
    assert.equal(res.body.data.user.role, 'user');
    assert.equal(res.body.data.user.subscription.plan, 'pro');
    assert.equal(res.body.data.user.password_hash, undefined);
    assert.equal(res.body.data.user.google_id, undefined);

    const me = await api('GET', '/api/auth/me', { token: res.body.data.token });
    assert.equal(me.status, 200);
  });

  it('signs the same Google account in again (200, same user)', async () => {
    const sub = `g-${randomUUID()}`;
    const email = `g_${randomUUID().slice(0, 8)}@gmail.com`;
    googleSays({ sub, email });
    const first = await signIn();
    const second = await signIn();
    assert.equal(second.status, 200);
    assert.equal(second.body.data.user.id, first.body.data.user.id);
  });

  it('links Google to an existing email+password account and keeps the password working', async () => {
    const { email, user } = await registerUser();
    googleSays({ sub: `g-${randomUUID()}`, email });
    const res = await signIn();
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.id, user.id);
    const pw = await api('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
    assert.equal(pw.status, 200);
  });

  it('never changes the role: an admin stays admin, nobody becomes admin', async () => {
    const { email, user } = await registerUser();
    db().users.find((u) => u.id === user.id).role = 'admin';
    googleSays({ sub: `g-${randomUUID()}`, email });
    const res = await signIn();
    assert.equal(res.body.data.user.role, 'admin');
  });

  it('refuses unverified emails and bad tokens', async () => {
    googleSays({ sub: `g-${randomUUID()}`, email: `g_${randomUUID().slice(0, 8)}@gmail.com`, email_verified: false });
    assert.equal((await signIn()).status, 401);

    setGoogleVerifier(async () => { throw new Error('bad signature'); });
    const bad = await signIn();
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error.code, 'INVALID_GOOGLE_TOKEN');
  });

  it('refuses an email already linked to a different Google account', async () => {
    const email = `g_${randomUUID().slice(0, 8)}@gmail.com`;
    googleSays({ sub: `g-${randomUUID()}`, email });
    await signIn();
    googleSays({ sub: `g-${randomUUID()}`, email });
    assert.equal((await signIn()).status, 409);
  });

  it('Google-only users get a clear error (not 500) on password login and password change', async () => {
    const email = `g_${randomUUID().slice(0, 8)}@gmail.com`;
    googleSays({ sub: `g-${randomUUID()}`, email });
    const { token } = (await signIn()).body.data;
    const login = await api('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
    assert.equal(login.status, 401);
    const change = await api('POST', '/api/profile/password', { token, body: { current_password: PASSWORD, new_password: 'NewPassw0rd-1' } });
    assert.notEqual(change.status, 500);
  });

  it('validates the body', async () => {
    assert.equal((await api('POST', '/api/auth/google', { body: {} })).status, 400);
    assert.equal((await api('POST', '/api/auth/google', { body: { credential: CREDENTIAL, role: 'admin' } })).status, 400);
  });
});

describe('Google sign-in from the Telegram Mini App (browser handoff)', () => {
  const start = async () => {
    const res = await api('POST', '/api/auth/google/handoff');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data;
  };
  const claim = (body) => api('POST', '/api/auth/google/handoff/claim', { body });

  it('the browser signs in, the Mini App receives the session exactly once', async () => {
    const { id, secret } = await start();
    assert.equal((await claim({ id, secret })).status, 202);

    const email = `g_${randomUUID().slice(0, 8)}@gmail.com`;
    googleSays({ sub: `g-${randomUUID()}`, email });
    const browser = await api('POST', '/api/auth/google', { body: { credential: CREDENTIAL, handoff: id } });
    assert.equal(browser.status, 200);
    assert.equal(browser.body.data.handoff, true);
    assert.equal(browser.body.data.token, undefined, 'the browser must not get the session');

    const got = await claim({ id, secret });
    assert.equal(got.status, 200);
    assert.equal(got.body.data.user.email, email);
    assert.equal(got.body.data.created, true);
    assert.equal((await api('GET', '/api/auth/me', { token: got.body.data.token })).status, 200);

    assert.equal((await claim({ id, secret })).status, 410, 'one-time');
  });

  it('a wrong secret cannot take the session', async () => {
    const { id } = await start();
    googleSays({ sub: `g-${randomUUID()}`, email: `g_${randomUUID().slice(0, 8)}@gmail.com` });
    await api('POST', '/api/auth/google', { body: { credential: CREDENTIAL, handoff: id } });
    assert.equal((await claim({ id, secret: 'y'.repeat(43) })).status, 410);
  });

  it('an unknown or used link is rejected before signing in', async () => {
    googleSays({ sub: `g-${randomUUID()}`, email: `g_${randomUUID().slice(0, 8)}@gmail.com` });
    const res = await api('POST', '/api/auth/google', { body: { credential: CREDENTIAL, handoff: 'z'.repeat(22) } });
    assert.equal(res.status, 410);

    const { id } = await start();
    assert.equal((await api('POST', '/api/auth/google', { body: { credential: CREDENTIAL, handoff: id } })).status, 200);
    assert.equal((await api('POST', '/api/auth/google', { body: { credential: CREDENTIAL, handoff: id } })).status, 410);
  });

  it('validates the claim body', async () => {
    assert.equal((await claim({})).status, 400);
    assert.equal((await claim({ id: 'bad id!', secret: 'x' })).status, 400);
  });
});
