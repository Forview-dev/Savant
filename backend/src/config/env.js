import dotenv from "dotenv";
dotenv.config();

function required(name, fallback = undefined) {
  const val = process.env[name] ?? fallback;
  if (val === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
}

function parseBoolean(v) {
  if (v === undefined || v === null) return undefined;
  const s = v.toString().trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(s)) return false;
  return undefined;
}

function boolOrDefault(v, def = false) {
  const parsed = parseBoolean(v);
  return parsed === undefined ? def : parsed;
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
  JWT_EXPIRES: Number(process.env.JWT_EXPIRES || 60 * 60 * 24 * 30), // seconds (30 days)
  COOKIE_NAME: 'sid',
  COOKIE_DOMAIN: undefined, // set in prod if needed
  COOKIE_SECURE: process.env.NODE_ENV === 'production',
  COOKIE_SAMESITE: 'lax',

  DATABASE_URL: required('DATABASE_URL'),
  DB_SSL: parseBoolean(process.env.DB_SSL),
  DB_SSL_REJECT_UNAUTHORIZED: parseBoolean(
    process.env.DB_SSL_REJECT_UNAUTHORIZED,
  ),
  DB_SSL_CA_CERT: process.env.DB_SSL_CA_CERT,
  DB_DISABLE_IPV6: boolOrDefault(process.env.DB_DISABLE_IPV6, true),
  DB_IPV4_HOST: process.env.DB_IPV4_HOST,
};
