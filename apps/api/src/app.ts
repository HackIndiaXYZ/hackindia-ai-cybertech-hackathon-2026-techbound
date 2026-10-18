import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/index.js';
import { requestContext } from './middleware/requestContext.js';
import { errorHandler, notFoundHandler } from './errors/errorHandler.js';
import { v1Router } from './routes/v1/index.js';

/**
 * Builds the Express application (factory form for easy testing, plan §11).
 * Secure headers + CORS allow-list + request validation + centralized errors.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || config.api.corsAllowedOrigins.includes(origin)) {
          cb(null, true);
          return;
        }
        cb(new Error('CORS_NOT_ALLOWED'));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' })); // cap body size (§25)
  app.use(requestContext);

  app.get('/', (_req, res) => {
    res.json({ name: 'ISL Platform API', docs: '/api/v1', health: '/api/v1/health' });
  });

  app.use('/api/v1', v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
