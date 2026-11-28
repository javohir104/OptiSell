import { Router } from 'express';
import * as staff from '../services/staff.service.js';
import { requireFeature } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/response.js';
import { idParams } from '../validators/common.js';
import { createStaffBody, statsQuery, updateStaffBody } from '../validators/staff.validators.js';

// Mounted behind requireAuth + ownerOnly. Listing/stats work on every plan (so an owner whose Max
// plan ended still sees and can remove sellers); adding sellers needs the 'staff' feature.
const router = Router();

router.get('/', async (req, res) => sendSuccess(res, await staff.listStaff(req.user.id)));

router.get('/stats', validate({ query: statsQuery }), async (req, res) => {
  sendSuccess(res, await staff.sellerStats(req.user.id, req.valid.query));
});

router.post('/', requireFeature('staff'), validate({ body: createStaffBody }), async (req, res) => {
  sendSuccess(res, await staff.createStaff(req.user.id, req.valid.body), { status: 201 });
});

router.patch('/:id', validate({ params: idParams, body: updateStaffBody }), async (req, res) => {
  sendSuccess(res, await staff.updateStaff(req.user.id, req.valid.params.id, req.valid.body));
});

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  sendSuccess(res, await staff.deleteStaff(req.user.id, req.valid.params.id));
});

export default router;
