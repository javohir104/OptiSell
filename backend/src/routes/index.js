import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';
import { requireAuth } from '../middleware/auth.js';
import authRoutes from './auth.routes.js';
import productRoutes from './product.routes.js';
import inventoryRoutes from './inventory.routes.js';
import saleRoutes from './sale.routes.js';
import expenseRoutes from './expense.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import analyticsRoutes from './analytics.routes.js';

const router = Router();

// Public
router.get('/health', getHealth);
router.use('/auth', authRoutes);

// Everything below requires a valid JWT.
router.use('/products', requireAuth, productRoutes);
router.use('/inventory', requireAuth, inventoryRoutes);
router.use('/sales', requireAuth, saleRoutes);
router.use('/expenses', requireAuth, expenseRoutes);
router.use('/dashboard', requireAuth, dashboardRoutes);
router.use('/analytics', requireAuth, analyticsRoutes);

export default router;
