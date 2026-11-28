/**
 * Local test data: one fixed account with products, 45 days of sales and some expenses,
 * so every screen (dashboard, analytics, AI forecast) has something to show.
 * Safe to run twice: an existing test account is left untouched.
 * NEVER run against production — the password is public (it is in the README).
 */
import { register } from '../services/auth.service.js';
import { findUser, findUserByEmail } from '../services/user.shared.js';
import { update } from './store.js';
import { createExpense } from '../services/expense.service.js';
import { createProduct } from '../services/product.service.js';
import { createSale } from '../services/sale.service.js';
import { addDays, localNoonIso, today } from '../utils/dates.js';
import { createSaleBody } from '../validators/sale.validators.js';

export const TEST_USER = {
  email: 'test@optisell.uz',
  password: 'Test12345',
  full_name: 'Test Foydalanuvchi',
  business_name: 'Test Do‘kon',
};

const PRODUCTS = [
  { sku: 'TEA-001', name: "Ko'k choy 100 paket", category: 'Ichimliklar', cost_price: '43500', selling_price: '88500', initial_quantity: 120, low_stock_threshold: 30, max_stock: 200, perDay: [3, 6] },
  { sku: 'COLA-1L', name: 'Coca-Cola 1L', category: 'Ichimliklar', cost_price: '7000', selling_price: '11000', initial_quantity: 400, low_stock_threshold: 50, max_stock: 500, perDay: [6, 12] },
  { sku: 'BREAD-01', name: 'Non', category: 'Non mahsulotlari', cost_price: '2500', selling_price: '4000', initial_quantity: 600, low_stock_threshold: 40, max_stock: 800, perDay: [10, 18] },
  { sku: 'RICE-5KG', name: 'Guruch 5 kg', category: 'Oziq-ovqat', cost_price: '65000', selling_price: '85000', initial_quantity: 25, low_stock_threshold: 10, max_stock: 80, perDay: [0, 2] },
  { sku: 'OIL-1L', name: "Kungaboqar yog'i 1L", category: 'Oziq-ovqat', cost_price: '18000', selling_price: '24000', initial_quantity: 8, low_stock_threshold: 15, max_stock: 100, perDay: [1, 2] },
  { sku: 'SOAP-01', name: 'Sovun', category: 'Maishiy', cost_price: '5000', selling_price: '9000', initial_quantity: 150, low_stock_threshold: 20, max_stock: 100, perDay: [0, 1] },
];

const EXPENSES = [
  { category: 'Ijara', amount: '3000000', description: 'Oylik ijara', daysAgo: 28 },
  { category: 'Kommunal', amount: '450000', description: 'Elektr va gaz', daysAgo: 20 },
  { category: 'Maosh', amount: '4000000', description: 'Sotuvchi maoshi', daysAgo: 5 },
  { category: 'Transport', amount: '250000', description: 'Yetkazib berish', daysAgo: 2 },
];

const PAYMENTS = ['cash', 'cash', 'card', 'transfer'];

// Deterministic pseudo-random numbers, so every seed produces the same data.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
    return s / 2_147_483_648;
  };
}

export async function seed({ days = 45, log = console.log } = {}) {
  if (findUserByEmail(TEST_USER.email)) {
    log(`Test account ${TEST_USER.email} already exists — nothing changed.`);
    return { created: false };
  }

  // Plan every sale first, so opening stock = today's stock + everything sold since.
  const random = rng(42);
  const plan = [];
  for (let d = days; d >= 1; d--) {
    const day = addDays(today(), -d);
    const weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
    PRODUCTS.forEach(({ perDay: [min, max] }, index) => {
      let quantity = min + Math.floor(random() * (max - min + 1));
      if (weekend) quantity = Math.round(quantity * 1.3);
      if (quantity > 0) plan.push({ day, index, quantity, payment: PAYMENTS[Math.floor(random() * PAYMENTS.length)] });
    });
  }

  const { user } = await register(TEST_USER);
  // Demo data: left out of the admin panel statistics.
  update('users', findUser(user.id), { is_test_account: true });
  const productIds = [];
  for (const [index, { perDay: _perDay, ...p }] of PRODUCTS.entries()) {
    const sold = plan.filter((s) => s.index === index).reduce((sum, s) => sum + s.quantity, 0);
    productIds.push((await createProduct(user.id, { ...p, initial_quantity: p.initial_quantity + sold })).id);
  }

  for (const s of plan) {
    const body = createSaleBody.parse({
      items: [{ product_id: productIds[s.index], quantity: s.quantity }],
      payment_method: s.payment,
      sold_at: localNoonIso(s.day),
    });
    await createSale(user.id, body);
  }

  for (const { daysAgo, ...e } of EXPENSES) {
    await createExpense(user.id, { ...e, expense_date: addDays(today(), -daysAgo) });
  }

  log(`Created ${TEST_USER.email} with ${productIds.length} products, ${plan.length} sales, ${EXPENSES.length} expenses.`);
  return { created: true, userId: user.id, products: productIds.length, sales: plan.length };
}
