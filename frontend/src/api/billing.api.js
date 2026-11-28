import api, { unwrap } from './axios';
import { toPayment, toSubscription } from './backend';

const real = {
  plans: () => api.get('/billing/plans').then(unwrap).then((d) => ({
    plans: d.plans.map((p) => ({ id: p.id, pricePerMonth: p.price_per_month, limits: p.limits, features: p.features || [], prices: p.prices })),
    durations: d.durations,
    purchasingEnabled: d.purchasing_enabled === true,
    providers: d.providers,
  })),
  subscription: () => api.get('/billing/subscription').then(unwrap).then(toSubscription),
  /** { plan, months, provider } -> { payment, checkoutUrl } */
  checkout: (payload) => api.post('/billing/checkout', payload).then(unwrap).then((d) => ({
    payment: toPayment(d.payment),
    checkoutUrl: d.checkout_url,
  })),
  payments: () => api.get('/billing/payments').then(unwrap).then((rows) => rows.map(toPayment)),
  payment: (id) => api.get(`/billing/payments/${id}`).then(unwrap).then(toPayment),
};

export const billingApi = real;
