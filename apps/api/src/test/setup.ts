// Test environment setup — forces dev-safe fallback drivers + quiet logs.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DB_DRIVER = 'fallback';
process.env.REDIS_DRIVER = 'fallback';
process.env.API_AUTH_JWT_SECRET = 'test-secret-value-long-enough';
// Supabase Google OAuth seam: the unit suite drives the dev-mode HS256 path, which
// is only reachable when no real project is configured (and which production refuses
// to boot with). SUPABASE_ISSUER_URL is blanked explicitly because `apps/api/.env`
// now holds a live project URL, and dotenv does not override values set here —
// without this the suite would silently switch to the JWKS path.
process.env.SUPABASE_ISSUER_URL = '';
process.env.OAUTH_DEV_MODE = 'true';
process.env.OAUTH_DEV_SECRET = 'test-oauth-dev-secret';
