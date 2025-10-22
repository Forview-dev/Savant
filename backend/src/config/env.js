import dotenv from 'dotenv';

dotenv.config();

function required(name, fallback) {
  const val = process.env[name] ?? fallback;
  if (val === undefined || val === null || val === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

const PROTOCOL_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

function normalizeOriginCandidate(raw) {
  const value = String(raw).trim();
  if (!value) return null;

  if (value.includes('*')) {
    return value;
  }

  const attempts = [value];
  if (!PROTOCOL_REGEX.test(value)) {
    // Assume https for bare domains (e.g., example.com) and fall back to http for
    // local dev conveniences like localhost:5173.
    attempts.push(`https://${value}`);
    attempts.push(`http://${value}`);
  }

  for (const attempt of attempts) {
    try {
      const url = new URL(attempt);
      if (!/^https?:$/.test(url.protocol)) {
        continue;
      }
      return url.origin;
    } catch (err) {
      // Try the next attempt; log later if all attempts fail.
    }
  }

  console.warn(
    `Skipping invalid origin "${value}". Provide a full URL (e.g. https://example.com) ` +
      'or a wildcard such as https://*.example.com.'
  );
  return null;
}

function parseOriginList(input, fallback) {
  const values = [];
  const push = (candidate) => {
    if (candidate === undefined || candidate === null) return;
    const normalized = normalizeOriginCandidate(candidate);
    if (!normalized) return;
    values.push(normalized);
  };

  if (Array.isArray(input)) {
    input.forEach(push);
  } else if (typeof input === 'string') {
    input
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach(push);
  } else if (input) {
    push(input);
  }

  if (!values.length && fallback !== undefined) {
    if (Array.isArray(fallback)) {
      fallback.forEach(push);
    } else {
      push(fallback);
    }
  }

  // Deduplicate while preserving order
  return [...new Set(values)];
}

function deriveCookieSameSite(cookieSecure, override) {
  if (!override) {
    return cookieSecure ? 'none' : 'lax';
  }

  const normalized = String(override).trim().toLowerCase();
  if (['lax', 'strict', 'none'].includes(normalized)) {
    if (normalized === 'none' && !cookieSecure) {
      console.warn('Ignoring COOKIE_SAMESITE=none because COOKIE_SECURE is disabled.');
      return 'lax';
    }
    return normalized;
  }

  console.warn(`Unsupported COOKIE_SAMESITE value "${override}". Falling back to lax.`);
  return cookieSecure ? 'none' : 'lax';
}

function normalizeBaseUrl(value, name = 'URL') {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) {
      throw new Error(`Expected http(s) protocol for ${name}`);
    }
    url.hash = '';
    url.search = '';
    return url.href.replace(/\/+$/, '');
  } catch (err) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL =
  process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');

const FRONTEND_ORIGINS = parseOriginList(
  process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_ORIGIN,
  'http://localhost:5173'
);
const FRONTEND_ORIGIN =
  FRONTEND_ORIGINS.find((origin) => !origin.includes('*')) ||
  FRONTEND_ORIGINS[0] ||
  'http://localhost:5173';

const APP_BASE_URL = normalizeBaseUrl(
  required('APP_BASE_URL', 'http://localhost:4000'),
  'APP_BASE_URL'
);
const PORT = parseNumber(process.env.PORT, 4000);
const JWT_EXPIRES_SECONDS = parseNumber(
  process.env.JWT_EXPIRES,
  2592000
);
const MAGIC_LINK_EXPIRY_MIN = parseNumber(process.env.MAGIC_LINK_EXPIRY_MIN, 15);
const COOKIE_NAME = process.env.COOKIE_NAME || 'sid';
const COOKIE_SECURE = toBool(process.env.COOKIE_SECURE, NODE_ENV === 'production');
const COOKIE_SAMESITE = deriveCookieSameSite(
  COOKIE_SECURE,
  process.env.COOKIE_SAMESITE
);
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

const DB_SSL = toBool(process.env.DB_SSL, NODE_ENV === 'production');
const DB_DISABLE_IPV6 = toBool(process.env.DB_DISABLE_IPV6, true);
const DB_IPV4_HOST = process.env.DB_IPV4_HOST || undefined;

export const env = {
  NODE_ENV,
  LOG_LEVEL,
  PORT,
  FRONTEND_ORIGINS,
  FRONTEND_ORIGIN,
  APP_BASE_URL,

  JWT_SECRET: required('JWT_SECRET', 'change-me-in-dev'),
  JWT_EXPIRES: JWT_EXPIRES_SECONDS,
  COOKIE_NAME,
  COOKIE_DOMAIN,
  COOKIE_SECURE,
  COOKIE_SAMESITE,

  MAGIC_LINK_EXPIRY_MIN,
  MAGIC_LINK_EXPIRY_MS: MAGIC_LINK_EXPIRY_MIN * 60 * 1000,

  DATABASE_URL: required('DATABASE_URL'),
  DB_SSL,
  DB_DISABLE_IPV6,
  DB_IPV4_HOST,

  SMTP: {
    host: process.env.SMTP_HOST || undefined,
    port: parseNumber(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    secure: toBool(process.env.SMTP_SECURE, false),
    from: process.env.SMTP_FROM || 'Savant <no-reply@example.com>',
  },
};
