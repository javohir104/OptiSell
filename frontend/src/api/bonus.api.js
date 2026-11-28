import api, { unwrap } from './axios';

export const bonusApi = {
  overview: () => api.get('/bonus').then(unwrap).then((d) => ({
    balance: d.balance,
    code: d.referral_code,
    todayRevenue: Number(d.today_revenue) || 0,
    rules: d.rules,
    referrals: d.referrals.map((r) => ({ name: r.name, business: r.business, joinedAt: r.joined_at, active: r.active, plan: r.plan, points: r.points_earned })),
    history: d.history.map((h) => ({ id: h.id, type: h.type, points: h.points, day: h.day, friend: h.friend, createdAt: h.created_at })),
  })),
  redeem: (plan) => api.post('/bonus/redeem', { plan }).then(unwrap),
  contest: (month) => api.get('/bonus/contest', { params: month ? { month } : {} }).then(unwrap).then((d) => ({
    month: d.month,
    endsAt: d.ends_at,
    prize: d.prize,
    participants: d.participants,
    top: d.top.map((r) => ({ rank: r.rank, name: r.name, points: r.points, isMe: r.is_me })),
    me: { rank: d.me.rank, points: d.me.points, toFirst: d.me.to_first, toTop: d.me.to_top, eligible: d.me.eligible },
    winners: d.winners.map((w) => ({ month: w.month, name: w.name, points: w.points, plan: w.plan, isMe: w.is_me })),
  })),
};

const REF_KEY = 'optisell_ref';

/** Remember ?ref=CODE from an invite link until the visitor signs up. */
export function captureReferral() {
  try {
    const code = new URLSearchParams(window.location.search).get('ref');
    if (code && /^[A-Za-z0-9]{4,20}$/.test(code)) localStorage.setItem(REF_KEY, code.toUpperCase());
  } catch { /* ignore */ }
}
export const savedReferral = () => { try { return localStorage.getItem(REF_KEY) || undefined; } catch { return undefined; } };
export const clearReferral = () => { try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ } };
