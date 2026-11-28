import { Router } from 'express';
import * as ctrl from '../controllers/admin.controller.js';
import { requireAdmin } from '../middleware/auth.js';
import { audit } from '../services/adminAuth.service.js';
import { createBackup, exportAll, listBackups } from '../services/backup.service.js';
import { createResetLink } from '../services/passwordReset.service.js';
import { sendSuccess } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import {
  activeUsersQuery,
  auditLogQuery,
  chartQuery,
  listPaymentsQuery,
  listUsersQuery,
  rangeQuery,
  updateUserBody,
} from '../validators/admin.validators.js';

/**
 * /api/admin — the admin signs in on the normal login page; every endpoint here requires
 * role = 'admin' in the database, re-checked on every request (not signed in -> 401, not admin -> 403).
 */
const router = Router();

router.use(requireAdmin);

router.get('/auth/me', ctrl.me);
router.get('/overview', validate({ query: rangeQuery }), ctrl.overview);
router.get('/chart', validate({ query: chartQuery }), ctrl.chart);
router.get('/traffic', validate({ query: rangeQuery }), ctrl.traffic);
router.get('/active-users', validate({ query: activeUsersQuery }), ctrl.activeUsers);
router.get('/users', validate({ query: listUsersQuery }), ctrl.listUsers);
router.get('/users/:id', validate({ params: idParams }), ctrl.getUser);
router.patch('/users/:id', validate({ params: idParams, body: updateUserBody }), ctrl.updateUser);
router.get('/payments', validate({ query: listPaymentsQuery }), ctrl.listPayments);
router.get('/audit-log', validate({ query: auditLogQuery }), ctrl.auditLog);

// One-time password reset link for a user (for support, when the user has no Telegram linked).
router.post('/users/:id/reset-link', validate({ params: idParams }), (req, res) => {
  const link = createResetLink(req.valid.params.id);
  audit(req.admin.id, 'user.reset_link', { targetId: req.valid.params.id, ip: req.ip });
  sendSuccess(res, link);
});

// Backups of the whole database (automatic ones are in backend/data/backups).
router.get('/backups', (req, res) => sendSuccess(res, listBackups()));
router.post('/backups', (req, res) => {
  const backup = createBackup();
  audit(req.admin.id, 'backup.create', { details: { name: backup?.name ?? null }, ip: req.ip });
  sendSuccess(res, backup, { status: 201 });
});
router.get('/backups/download', (req, res) => {
  audit(req.admin.id, 'backup.download', { ip: req.ip });
  const day = new Date().toISOString().slice(0, 10);
  res.set('Content-Disposition', `attachment; filename="optisell-backup-${day}.json"`);
  res.set('Cache-Control', 'no-store');
  res.json(exportAll());
});

export default router;
