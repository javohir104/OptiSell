/**
 * OptiSell bonus points (for shop owners).
 *
 *   +15  a friend you invited opened a real shop (see ACTIVE_SHOP)
 *   +30  a friend you invited bought Pro (every paid purchase)
 *   +50  a friend you invited bought Max (every paid purchase)
 *   +30  you bought Pro yourself (every paid purchase)
 *   +50  you bought Max yourself (every paid purchase)
 *   +10  your shop's revenue for a day was over 1 500 000 so'm (counted after the day is over,
 *        net of returns, so fake sales that are returned later earn nothing)
 *
 * Points buy a month of a plan: 399 = Pro, 699 = Max.
 */
export const BONUS = Object.freeze({
  REFERRAL_ACTIVE: 15,
  REFERRAL_PRO: 30,
  REFERRAL_MAX: 50,
  SELF_PRO: 30, // you bought Pro yourself (every paid purchase)
  SELF_MAX: 50, // you bought Max yourself (every paid purchase)
  DAILY_REVENUE: 10,
  DAILY_REVENUE_THRESHOLD: 1_500_000, // so'm
  DAILY_REVENUE_LOOKBACK_DAYS: 7, // days checked after a server restart
  PRICE: { pro: 399, max: 699 },
  REDEEM_MONTHS: 1,
  // Monthly contest: whoever earns the most points in a calendar month gets this plan for free.
  CONTEST_PRIZE_PLAN: 'pro',
  CONTEST_PRIZE_MONTHS: 1,
  CONTEST_TOP: 10,
});

/** "Opened a real shop": shop name filled in, products added and sales recorded. */
export const ACTIVE_SHOP = Object.freeze({ products: 5, sales: 3 });
