// Integration test bootstrap (Phase 4D, P1-5). Unlike the unit setup, this does
// NOT force the in-memory fallback: DB_DRIVER / DATABASE_URL / REDIS_DRIVER come
// from the CI environment (real Postgres + Redis services). The spec itself
// self-skips unless DB_DRIVER=postgres, so a plain local run is a harmless no-op.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error';
process.env.API_AUTH_JWT_SECRET = process.env.API_AUTH_JWT_SECRET ?? 'test-secret-value-long-enough';
