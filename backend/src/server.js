// src/server.js
const express = require('express');
const cookieSession = require('cookie-session');
const cors = require('cors');
const helmet = require('helmet');
const { PORT, API_ORIGIN, SESSION_SECRET } = require('./config');
const authRoutes = require('./routes/auth');
const proceduresRoutes = require('./routes/procedures');
const prisma = require('./db');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// CORS - allow frontend dev origin and credentials
app.use(cors({
  origin: API_ORIGIN,
  credentials: true
}));

app.use(cookieSession({
  name: 'savant.session',
  keys: [SESSION_SECRET],
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

// mount API routes under /api
app.use('/api/auth', authRoutes);
app.use('/api/procedures', proceduresRoutes);

// simple health-check
app.get('/api/health', (req, res) => res.json({ ok: true, now: new Date().toISOString() }));

// global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

// start
app.listen(PORT, () => {
  console.log(`Savant for TTOM backend listening on port ${PORT}`);
});
