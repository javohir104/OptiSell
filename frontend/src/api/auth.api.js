import api, { unwrap } from './axios';
import { toAuth, toUser } from './backend';
import { clearReferral, savedReferral } from './bonus.api';

const ref = () => (savedReferral() ? { referral_code: savedReferral() } : {});
const done = (res) => { clearReferral(); return res; };

const real = {
  login: ({ email, password }) => api.post('/auth/login', { email, password }).then(unwrap).then(toAuth),
  register: ({ name, firstName, lastName, businessName, email, password }) =>
    api
      .post('/auth/register', {
        full_name: name,
        ...(firstName ? { first_name: firstName } : {}),
        ...(lastName ? { last_name: lastName } : {}),
        email,
        password,
        ...(businessName ? { business_name: businessName } : {}),
        ...ref(),
      })
      .then(unwrap)
      .then(done)
      .then(toAuth),
  google: (credential) => api.post('/auth/google', { credential, ...ref() }).then((r) => ({ ...toAuth(unwrap(r)), created: r.status === 201 })).then(done),
  forgotPassword: (email) => api.post('/auth/password/forgot', { email }).then(unwrap),
  resetPassword: ({ email, code, password }) => api.post('/auth/password/reset', { email, code, new_password: password }).then(unwrap),
  resetPasswordLink: ({ token, password }) => api.post('/auth/password/reset-link', { token, new_password: password }).then(unwrap),
  googleHandoffStart: () => api.post('/auth/google/handoff').then(unwrap),
  googleHandoffSignIn: (credential, handoff) => api.post('/auth/google', { credential, handoff }).then(unwrap),
  googleHandoffClaim: (id, secret) =>
    api.post('/auth/google/handoff/claim', { id, secret })
      .then((r) => (r.status === 202 ? null : { ...toAuth(unwrap(r)), created: Boolean(unwrap(r).created) })),
  me: () => api.get('/auth/me').then(unwrap).then((d) => ({ user: toUser(d.user) })),
};

export const authApi = {
  /** POST /auth/login  { email, password } -> { token, user } */
  login: real.login,
  /** POST /auth/register { name, businessName, email, password } -> { token, user } */
  register: real.register,
  forgotPassword: real.forgotPassword,
  resetPassword: real.resetPassword,
  resetPasswordLink: real.resetPasswordLink,
  /** POST /auth/google { credential } -> { token, user, created } */
  google: real.google,
  /** Telegram Mini App: POST /auth/google/handoff -> { id, secret } */
  googleHandoffStart: real.googleHandoffStart,
  /** External browser: POST /auth/google { credential, handoff } -> { handoff: true } */
  googleHandoffSignIn: real.googleHandoffSignIn,
  /** Telegram Mini App: POST /auth/google/handoff/claim -> null while pending, else { token, user, created } */
  googleHandoffClaim: real.googleHandoffClaim,
  /** GET /auth/me -> { user } */
  me: real.me,
};
