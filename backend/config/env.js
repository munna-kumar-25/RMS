import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const splitList = (value) => String(value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

/**
 * Read configuration without printing secret values.
 * MONGODB_URI is canonical. MONGO_URI remains an accepted alias.
 * CORS_ORIGINS is canonical. FRONTEND_URL remains an accepted alias.
 */
export const readEnv = (source = process.env) => {
  const mongoUri = source.MONGODB_URI || source.MONGO_URI || '';
  const corsOrigins = splitList(source.CORS_ORIGINS || source.FRONTEND_URL);
  const missing = [];

  if (!mongoUri) missing.push('MONGODB_URI');
  if (corsOrigins.length === 0) missing.push('CORS_ORIGINS');

  const port = Number(source.PORT || 5000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    missing.push('PORT');
  }

  const nodeEnv = source.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    missing.push('NODE_ENV');
  }

  const sessionSecret = source.SESSION_SECRET || '';
  if (sessionSecret.length < 32) missing.push('SESSION_SECRET');

  const sessionTtl = Number(source.SESSION_TTL_MINUTES || 480);
  if (!Number.isInteger(sessionTtl) || sessionTtl < 1 || sessionTtl > 10080) {
    missing.push('SESSION_TTL_MINUTES');
  }

  const trustProxyRaw = source.TRUST_PROXY || '';
  let trustProxy = false;
  if (trustProxyRaw) {
    if (!/^[1-9]\d*$/.test(trustProxyRaw)) missing.push('TRUST_PROXY');
    else trustProxy = Number(trustProxyRaw);
  }

  const cookieName = source.SESSION_COOKIE_NAME || 'rms.sid';
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(cookieName)) missing.push('SESSION_COOKIE_NAME');

  return {
    missing,
    env: {
      NODE_ENV: nodeEnv,
      PORT: port,
      MONGODB_URI: mongoUri,
      MONGO_URI: mongoUri,
      CORS_ORIGINS: corsOrigins,
      SESSION_SECRET: sessionSecret,
      SESSION_COOKIE_NAME: cookieName,
      SESSION_TTL_MINUTES: sessionTtl,
      TRUST_PROXY: trustProxy,
      JWT_SECRET: source.JWT_SECRET || '',
      JWT_EXPIRES_IN: source.JWT_EXPIRES_IN || '7d',
      ADMIN_EMAIL: source.ADMIN_EMAIL || '',
      ADMIN_PASSWORD: source.ADMIN_PASSWORD || '',
      FRONTEND_URL: source.FRONTEND_URL || corsOrigins[0] || '',
      SOCKET_CORS_ORIGIN: source.SOCKET_CORS_ORIGIN
        ? splitList(source.SOCKET_CORS_ORIGIN)
        : corsOrigins,
      SMTP_HOST: source.SMTP_HOST || '',
      SMTP_PORT: Number(source.SMTP_PORT) || 587,
      SMTP_SECURE: source.SMTP_SECURE === 'true',
      SMTP_USER: source.SMTP_USER || '',
      SMTP_PASSWORD: source.SMTP_PASSWORD || '',
      SMTP_FROM: source.SMTP_FROM || source.SMTP_USER || '',
      MSG91_AUTH_KEY: source.MSG91_AUTH_KEY || '',
      MSG91_OTP_TEMPLATE_ID: source.MSG91_OTP_TEMPLATE_ID || '',
      MSG91_COUNTRY_CODE: source.MSG91_COUNTRY_CODE || '91',
      REDIS_HOST: source.REDIS_HOST || '127.0.0.1',
      REDIS_PORT: Number(source.REDIS_PORT) || 6379,
      REDIS_PASSWORD: source.REDIS_PASSWORD || '',
      REDIS_URL: source.REDIS_URL || '',
    },
  };
};

export const enforceEnv = () => {
  const { missing } = readEnv();
  if (missing.length === 0) return;
  console.error(`Missing required configuration: ${missing.join(', ')}`);
  console.error('Copy backend/.env.example to backend/.env and set the required values.');
  process.exit(1);
};

const { env } = readEnv();

export { env };
export default env;
