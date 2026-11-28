import express, { Router } from 'express';
import { handleClick } from '../services/payments/click.js';
import { handlePayme } from '../services/payments/payme.js';

/**
 * Server-to-server callbacks from the payment providers. Public (no JWT): each request is
 * authenticated by the provider's own signature / Basic auth instead.
 */
const router = Router();

// Click sends application/x-www-form-urlencoded.
const form = express.urlencoded({ extended: false, limit: '20kb' });

router.post('/click/prepare', form, async (req, res) => res.json(await handleClick(req.body, 0)));
router.post('/click/complete', form, async (req, res) => res.json(await handleClick(req.body, 1)));

router.post('/payme', async (req, res) => res.json(await handlePayme(req.body, req.get('authorization'))));

export default router;
