import { Router } from 'express';
import { z } from 'zod';
import * as telegram from '../services/telegram.service.js';
import { requireFeature } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/response.js';

/** Signed-in owner: connect / disconnect Telegram, test messages. Mounted behind requireAuth + ownerOnly. */
export const telegramRoutes = Router();

telegramRoutes.get('/status', (req, res) => sendSuccess(res, telegram.status(req.user.id)));
telegramRoutes.post('/link', requireFeature('telegram'), (req, res) => sendSuccess(res, telegram.startLink(req.user.id)));
telegramRoutes.delete('/link', (req, res) => sendSuccess(res, telegram.unlink(req.user.id)));
telegramRoutes.post('/test', requireFeature('telegram'), async (req, res) => sendSuccess(res, await telegram.sendTest(req.user.id)));
telegramRoutes.post('/report', requireFeature('telegram'), async (req, res) => {
  sendSuccess(res, await telegram.sendReportNow(req.user.id));
});

/** Called by the OptiSell bot (telegram-bot/bot.js) with the shared X-Bot-Secret header. */
export const botRoutes = Router();

botRoutes.use((req, res, next) => {
  telegram.assertBotSecret(req.get('x-bot-secret'));
  next();
});

const chatId = z.number().int().positive();

botRoutes.post(
  '/link',
  validate({
    body: z.strictObject({
      code: z.string().regex(/^[0-9a-f]{24}$/),
      chat_id: chatId,
      language_code: z.string().max(10).optional(),
    }),
  }),
  async (req, res) => sendSuccess(res, await telegram.completeLink(req.valid.body)),
);

botRoutes.post('/unlink', validate({ body: z.strictObject({ chat_id: chatId }) }), (req, res) => {
  sendSuccess(res, telegram.unlinkChat(req.valid.body.chat_id));
});
