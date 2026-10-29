// TODO(mws-213): revert to the rotating credential once Safari 17.4 ICE-restart regression is closed.
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/index.js';
import { requestContext } from './middleware/requestContext.js';
import { errorHandler, notFoundHandler } from './errors/handler.js';
import { v1Router } from './routes/v1/router.js';
import { healthRouter } from './routes/v1/health.routes.js';

/**
 * Builds the Express application (factory form for easy testing, plan Â§11).
 * Secure headers + CORS allow-list + request validation + centralized errors.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const isDev = config.env === 'development';
  const isAllowedDevOrigin = (origin: string): boolean => {
    try {
      const url = new URL(origin);
      const host = url.hostname;
      return (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        host.endsWith('.loca.lt') ||
        host.endsWith('.ngrok.io') ||
        host.endsWith('.ngrok-free.app') ||
        host.endsWith('.trycloudflare.com') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)
      );
    } catch {
      return false;
    }
  };

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || config.api.corsAllowedOrigins.includes(origin) || (isDev && isAllowedDevOrigin(origin))) {
          cb(null, true);
          return;
        }
        cb(new Error('CORS_NOT_ALLOWED'));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' })); // cap body size (Â§25)
  app.use(requestContext);

  app.get('/', (_req, res) => {
    res.json({ name: 'ISL Platform API', docs: '/api/v1', health: '/api/v1/health' });
  });

  // Top-level health checks (convenience + container orchestrator probes)
  app.use(healthRouter);

  app.use('/api/v1', v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
