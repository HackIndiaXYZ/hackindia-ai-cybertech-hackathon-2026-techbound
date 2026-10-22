import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { metricsRouter } from './metrics.routes.js';
import { authRouter } from './auth.routes.js';
import { usersRouter } from './users.routes.js';
import { sessionsRouter } from './sessions.routes.js';
import { miscRouter } from './misc.routes.js';
import { islRouter } from './isl.routes.js';
import { ttsRouter } from './tts.routes.js';
import { speechRouter } from './speech.routes.js';

/** /api/v1 root router (plan §23 versioned APIs). */
export const v1Router = Router();

v1Router.get('/', (_req, res) => {
  res.json({
    data: {
      name: 'ISL Platform API',
      version: 'v1',
      endpoints: [
        '/api/v1/health',
        '/api/v1/health/ready',
        '/api/v1/metrics',
        '/api/v1/providers',
        '/api/v1/telemetry',
        '/api/v1/auth',
        '/api/v1/users',
        '/api/v1/sessions',
        '/api/v1/sessions/contacts',
        '/api/v1/messages',
        '/api/v1/transcripts',
        '/api/v1/translations',
        '/api/v1/gestures',
        '/api/v1/feedback',
        '/api/v1/consent',
        '/api/v1/admin/feedback',
        '/api/v1/isl/health',
        '/api/v1/isl/predict/static',
        '/api/v1/isl/predict/dynamic',
        '/api/v1/isl/translate',
        '/api/v1/tts/health',
        '/api/v1/tts/voices',
        '/api/v1/tts/synthesize',
        '/api/v1/speech/health',
        '/api/v1/speech/transcribe',
      ],
    },
  });
});

v1Router.use(healthRouter);
v1Router.use(metricsRouter);
v1Router.use('/auth', authRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/sessions', sessionsRouter);
v1Router.use('/isl', islRouter);
v1Router.use('/tts', ttsRouter);
v1Router.use('/speech', speechRouter);
// miscRouter defines /messages, /transcripts, /translations, /gestures, /feedback, /consent
v1Router.use('/', miscRouter);

