import dotenv from "dotenv";
dotenv.config();

function required(name, fallback = undefined) {
  const val = process.env[name] ?? fallback;
  if (val === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
}

function toBool(v, def = false) {
  const s = (v ?? '').toString().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return def;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  PORT: Number(process.env.PORT || 4000),
  FRONTEND_ORIGIN: required('FRONTEND_ORIGIN', 'http://localhost:5173'),
  APP_BASE_URL: required('APP_BASE_URL', 'http://localhost:4000'),

  JWT_SECRET: required('JWT_SECRET', 'change-me-in-dev'),
  JWT_EXPIRES: Number(process.env.JWT_EXPIRES || 3600), // seconds
  COOKIE_NAME: 'sid',
  COOKIE_DOMAIN: undefined, // set in prod if needed
  COOKIE_SECURE: process.env.NODE_ENV === 'production',
  COOKIE_SAMESITE: 'lax',

  DATABASE_URL: required('DATABASE_URL'),
  DB_SSL: toBool(process.env.DB_SSL, false),
};
