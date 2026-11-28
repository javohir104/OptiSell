import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';
import { ownerOnly, requireAuth, requireFeature } from '../middleware/auth.js';
import authRoutes from './auth.routes.js';
import productRoutes from './product.routes.js';
import inventoryRoutes from './inventory.routes.js';
import saleRoutes from './sale.routes.js';
import expenseRoutes from './expense.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import importRoutes from './import.routes.js';
import profileRoutes from './profile.routes.js';
import billingRoutes from './billing.routes.js';
import paymentRoutes from './payments.routes.js';
import adminRoutes from './admin.routes.js';
import trackRoutes from './track.routes.js';
import customerRoutes from './customer.routes.js';
import supplierRoutes from './supplier.routes.js';
import staffRoutes from './staff.routes.js';
import bonusRoutes from './bonus.routes.js';
import shopRoutes from './shop.routes.js';
import { botRoutes, telegramRoutes } from './telegram.routes.js';

const router = Router();

// Public
router.get('/health', getHealth);
router.use('/auth', authRoutes);
router.use('/billing', billingRoutes); // /plans is public, the rest checks the JWT itself
router.use('/payments', paymentRoutes); // Click / Payme callbacks
router.use('/track', trackRoutes); // page views for the admin panel statistics
router.use('/telegram/bot', botRoutes); // called by the OptiSell bot with the shared secret

// Admin panel: own login, admin-only tokens, role re-checked on every request.
router.use('/admin', adminRoutes);

// Everything below requires a valid JWT. Seller (staff) accounts work on the owner's data
// (req.user.id = owner), but only where the route allows it; ownerOnly blocks the rest.
router.use('/products', requireAuth, productRoutes);
router.use('/inventory', requireAuth, inventoryRoutes);
router.use('/sales', requireAuth, saleRoutes);
router.use('/customers', requireAuth, requireFeature('debts'), customerRoutes);
router.use('/suppliers', requireAuth, ownerOnly, requireFeature('suppliers'), supplierRoutes);
router.use('/expenses', requireAuth, ownerOnly, requireFeature('expenses'), expenseRoutes);
router.use('/dashboard', requireAuth, ownerOnly, dashboardRoutes);
router.use('/import', requireAuth, ownerOnly, importRoutes);
router.use('/staff', requireAuth, ownerOnly, staffRoutes);
router.use('/bonus', requireAuth, ownerOnly, bonusRoutes);
router.use('/telegram', requireAuth, ownerOnly, telegramRoutes);
router.use('/profile', requireAuth, profileRoutes);
router.use('/shops', requireAuth, shopRoutes); // shops map: every signed-in user sees it

export default router;
