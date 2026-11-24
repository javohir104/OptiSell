import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Only trust X-Forwarded-For when actually behind N proxies (TRUST_PROXY), otherwise
  // attackers could spoof their IP and bypass rate limiting.
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow non-browser clients (curl, Postman, Python AI service) with no Origin header.
        if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  app.use('/api', apiLimiter, routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
