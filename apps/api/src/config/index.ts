import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralized, validated configuration layer (plan §11 backend item 6, §25).
 * Reads process.env once, validates, and exposes a typed, immutable config.
 * No secrets are ever logged or exported beyond this object.
 */

const csv = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  );

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z
    .preprocess((val) => val ?? process.env.PORT, z.coerce.number().int().positive())
    .default(4000),
  CORS_ALLOWED_ORIGINS: csv.default('http://localhost:5173'),

  API_AUTH_JWT_SECRET: z.string().min(1).default('change-me-in-production'),
  API_AUTH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  API_AUTH_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  API_AUTH_RESET_TTL_SECONDS: z.coerce.number().int().positive().default(1800),

  // Phase 5.2 mail: pluggable transport, no hard dependency. `console` logs the
  // message (dev/test), `none` swallows it. A real SMTP/SES transport plugs in
  // behind an ADR (§cross-cutting: no new runtime dep without one).
  MAIL_TRANSPORT: z.enum(['console', 'none']).default('console'),
  MAIL_FROM: z.string().default('no-reply@missingwhisper.local'),
  PUBLIC_WEB_BASE_URL: z.string().default('http://localhost:5173'),

  // Phase 5.3 Cloudflare Turnstile. Off by default so dev/test/e2e are unaffected;
  // when enabled the API verifies each credential submission server-side. Only the
  // secret + verify URL are server concerns — the site key is public (VITE_*).
  TURNSTILE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  TURNSTILE_SECRET_KEY: z.string().default(''),
  TURNSTILE_VERIFY_URL: z.string().default('https://challenges.cloudflare.com/turnstile/v0/siteverify'),

  DB_DRIVER: z.enum(['postgres', 'fallback']).default('fallback'),
  DATABASE_URL: z.string().default('postgres://isl:isl@localhost:5432/isl'),

  REDIS_DRIVER: z.enum(['redis', 'fallback']).default('fallback'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ALLOW_FALLBACK_REDIS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  STUN_URLS: csv.default('stun:stun.l.google.com:19302'),
  TURN_URL: z.string().default(''),
  TURN_USERNAME: z.string().default(''),
  TURN_CREDENTIAL: z.string().default(''),

  SPEECH_PROVIDER: z.string().default('stub'),
  SPEECH_SERVICE_BASE_URL: z.string().default('http://localhost:8001'),
  VISION_PROVIDER: z.string().default('mediapipe'),
  TRANSLATION_PROVIDER: z.string().default('rulebased'),
  TTS_PROVIDER: z.string().default('stub'),
  TTS_SERVICE_BASE_URL: z.string().default('http://localhost:8002'),
  ISL_ENGINE_BASE_URL: z.string().default('http://localhost:7861'),
  ISL_ENGINE_WS_URL: z.string().default('ws://localhost:7861/ws/predict'),

  RECORDING_CONSENT_REQUIRED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  MEDIA_RETENTION_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Do not dump values (may contain secrets). Only list offending keys.
  const issues = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  throw new Error(`Invalid environment configuration for keys: ${issues}`);
}

const env = parsed.data;

const isProd = env.NODE_ENV === 'production';

if (isProd && env.API_AUTH_JWT_SECRET === 'change-me-in-production') {
  throw new Error('Refusing to start in production with the default JWT secret.');
}
if (isProd && env.DB_DRIVER !== 'postgres') {
  throw new Error('Production must use real postgres driver (e.g. Neon PostgreSQL), not fallback.');
}
if (isProd && env.REDIS_DRIVER !== 'redis' && !env.ALLOW_FALLBACK_REDIS) {
  throw new Error(
    'Production requires a real redis driver (e.g. Upstash Redis / Redis URL). Set REDIS_DRIVER=redis and REDIS_URL, or explicitly set ALLOW_FALLBACK_REDIS=true to permit the in-memory fallback.',
  );
}
// 4E.4.2: refuse to boot with a half-configured TURN server (a set but credential-less
// TURN silently degrades every relay candidate to host/srflx -> mobile-data failures).
const turnFieldsSet = [env.TURN_URL, env.TURN_USERNAME, env.TURN_CREDENTIAL].filter(Boolean).length;
if (isProd && turnFieldsSet > 0 && turnFieldsSet < 3) {
  throw new Error(
    'Production refuses to boot with a half-configured TURN: TURN_URL, TURN_USERNAME and TURN_CREDENTIAL must all be set together.',
  );
}
// 5.3: enabling Turnstile without its secret is a silent fail-open (every request
// would error against an empty secret), so refuse to boot on that misconfiguration.
if (isProd && env.TURNSTILE_ENABLED && !env.TURNSTILE_SECRET_KEY) {
  throw new Error('Production refuses to boot with TURNSTILE_ENABLED=true but no TURNSTILE_SECRET_KEY.');
}

export const config = Object.freeze({
  env: env.NODE_ENV,
  isProd,
  isTest: env.NODE_ENV === 'test',
  logLevel: env.LOG_LEVEL,

  api: {
    host: env.API_HOST,
    port: env.API_PORT,
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS,
    jwtSecret: env.API_AUTH_JWT_SECRET,
    tokenTtlSeconds: env.API_AUTH_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: env.API_AUTH_REFRESH_TTL_SECONDS,
    passwordResetTtlSeconds: env.API_AUTH_RESET_TTL_SECONDS,
  },

  mail: {
    transport: env.MAIL_TRANSPORT,
    from: env.MAIL_FROM,
    webBaseUrl: env.PUBLIC_WEB_BASE_URL,
  },

  turnstile: {
    enabled: env.TURNSTILE_ENABLED,
    secretKey: env.TURNSTILE_SECRET_KEY,
    verifyUrl: env.TURNSTILE_VERIFY_URL,
  },

  db: {
    driver: env.DB_DRIVER,
    url: env.DATABASE_URL,
  },

  redis: {
    driver: env.REDIS_DRIVER,
    url: env.REDIS_URL,
  },

  iceServers: buildIceServers(env),

  // Raw ICE material for the server-side `verify:ice` reachability probe (4E.4.1).
  // The credential is never printed; only transport type + latency are reported.
  ice: {
    stunUrls: env.STUN_URLS,
    turn: env.TURN_URL
      ? { url: env.TURN_URL, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }
      : null,
  },

  providers: {
    speech: env.SPEECH_PROVIDER,
    speechServiceBaseUrl: env.SPEECH_SERVICE_BASE_URL,
    vision: env.VISION_PROVIDER,
    translation: env.TRANSLATION_PROVIDER,
    tts: env.TTS_PROVIDER,
    ttsServiceBaseUrl: env.TTS_SERVICE_BASE_URL,
    islEngineBaseUrl: env.ISL_ENGINE_BASE_URL,
    islEngineWsUrl: env.ISL_ENGINE_WS_URL,
  },
  ttsServiceBaseUrl: env.TTS_SERVICE_BASE_URL,
  islEngineBaseUrl: env.ISL_ENGINE_BASE_URL,
  islEngineWsUrl: env.ISL_ENGINE_WS_URL,

  privacy: {
    recordingConsentRequired: env.RECORDING_CONSENT_REQUIRED,
    mediaRetentionEnabled: env.MEDIA_RETENTION_ENABLED,
  },
});

function buildIceServers(e: z.infer<typeof EnvSchema>) {
  const servers: Array<{ urls: string[]; username?: string; credential?: string }> = e.STUN_URLS.map(
    (url) => ({ urls: [url] }),
  );
  if (e.TURN_URL) {
    servers.push({
      urls: [e.TURN_URL],
      username: e.TURN_USERNAME || undefined,
      credential: e.TURN_CREDENTIAL || undefined,
    });
  }
  return servers;
}

export type AppConfig = typeof config;
