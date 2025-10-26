process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { authRouter } from './modules/auth/routes.js';
import { requireAuthOptional, signSession } from './middleware/auth.js';
import { sopsRouter } from './modules/sops/routes.js';
import { query } from './lib/db.js';

const logger = pino({ level: env.LOG_LEVEL });
export const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
// CORS: allow exact FE origin (and common local dev origins), with credentials
const allowedOrigins = new Set([
  env.FRONTEND_ORIGIN,                  // e.g., https://savant-1ig.pages.dev
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

const corsOptions = {
  origin(origin, cb) {
    // allow same-origin requests (no Origin header) and whitelisted FE origins
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
  preflightContinue: false,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // handle preflight for all routes

app.set('trust proxy', 1);
app.use(cookieParser());

app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

app.set('signSession', signSession);

app.get('/', (req, res) => {
  res.status(200).json({
    name: 'sop-backend',
    status: 'ok',
    env: env.NODE_ENV,
    message: 'SOP backend API is running.',
  });
});

app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/auth', authRouter);

app.get('/me', requireAuthOptional, async (req, res) => {
  try {
    // never cache auth state
    res.setHeader('Cache-Control', 'no-store');

    // If not logged in, signal clearly
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });

    const email = req.user.email;

    // Always fetch the latest role from DB by email.
    const { rows } = await query(
      `SELECT role
         FROM users
        WHERE email = $1
        LIMIT 1`,
      [email]
    );

    // Fallback to token's role if not found in DB (should be rare)
    const freshRole = rows[0]?.role || req.user.role;

    // Return fresh role
    return res.status(200).json({
      user: {
        email,
        role: freshRole,
      },
    });
  } catch (err) {
    console.error('GET /me failed:', err);
    // On error, don't leak details; but still return whatever we have
    const user = req.user ? { email: req.user.email, role: req.user.role } : null;
    return res.status(401).json({ error: 'unauthenticated', user });
  }
});

app.use(sopsRouter);

app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

app.use((err, req, res, _next) => {
  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal Server Error' });
});

if (env.NODE_ENV !== 'test') {
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, frontend: env.FRONTEND_ORIGIN }, 'API listening');
  });
}
