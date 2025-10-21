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

const logger = pino({ level: env.LOG_LEVEL });
const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
  })
);
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

app.get('/me', requireAuthOptional, (req, res) => {
  const user = req.user ? { email: req.user.email, role: req.user.role } : null;
  res.status(200).json({ user });
});

app.use('/sops', sopsRouter);

app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

app.use((err, req, res, _next) => {
  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, frontend: env.FRONTEND_ORIGIN }, 'API listening');
});
