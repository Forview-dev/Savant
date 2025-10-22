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

// import { withFreshRole } from './middleware/withFreshRole.js';


const logger = pino({ level: env.LOG_LEVEL });
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

function compileCorsMatcher(patterns) {
  const matchers = (patterns || [])
    .map((pattern) => {
      if (!pattern) return null;
      if (pattern.includes('*')) {
        const escaped = pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\\\*/g, '.*');
        const regex = new RegExp(`^${escaped}$`);
        return (origin) => regex.test(origin);
      }
      return (origin) => origin === pattern;
    })
    .filter(Boolean);

  if (!matchers.length) {
    return () => true;
  }

  return (origin) => {
    if (!origin) return true;
    return matchers.some((match) => match(origin));
  };
}

const isAllowedOrigin = compileCorsMatcher(env.FRONTEND_ORIGINS);
const corsMiddleware = cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, origin);
    logger.warn({ origin }, 'Blocked request due to disallowed CORS origin');
    return callback(new Error('Not allowed by CORS'));
  },
});

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.options('*', corsMiddleware);
app.use((req, res, next) => {
  corsMiddleware(req, res, (err) => {
    if (!err) return next();
    return res.status(403).json({ error: 'Origin not allowed' });
  });
});
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/healthz',
    },
  })
);

app.set('signSession', signSession);

app.get('/', (req, res) => {
  res.status(200).json({
    name: 'sop-backend',
    status: 'ok',
    env: env.NODE_ENV,
    allowedOrigins: env.FRONTEND_ORIGINS,
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
    // If not logged in, keep current behavior
    if (!req.user) return res.status(200).json({ user: null });

    const email = req.user.email;

    // Always fetch the latest role from DB by email.
    // Change `users` to `profiles` if that's your table.
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
    return res.status(200).json({ user });
  }
});

app.use(sopsRouter);

app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

app.use((err, req, res, _next) => {
  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, frontend: env.FRONTEND_ORIGIN, origins: env.FRONTEND_ORIGINS },
    'API listening'
  );
});
