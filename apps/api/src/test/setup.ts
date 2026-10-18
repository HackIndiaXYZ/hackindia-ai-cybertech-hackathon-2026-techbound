// Test environment setup — forces dev-safe fallback drivers + quiet logs.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DB_DRIVER = 'fallback';
process.env.REDIS_DRIVER = 'fallback';
process.env.API_AUTH_JWT_SECRET = 'test-secret-value-long-enough';
