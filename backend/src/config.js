import 'dotenv/config';

const env = process.env;

function required(name, fallbackForDev) {
  const value = env[name];
  if (value) return value;
  if (env.NODE_ENV !== 'production' && fallbackForDev !== undefined) return fallbackForDev;
  throw new Error(`Missing required environment variable ${name}`);
}

const corsOrigins = (env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export const config = {
  env: env.NODE_ENV || 'development',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT) || 4000,
  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
  jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
  corsOrigins,
  loginRateLimit: Number(env.LOGIN_RATE_LIMIT) || 10,
  version: '1.0.0',
};

if (config.isProd && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
