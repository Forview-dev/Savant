// src/config.js
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  PORT: process.env.PORT || 4000,
  API_ORIGIN: process.env.API_ORIGIN || 'http://localhost:5173',
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-change-me',
  MAGIC_LINK_EXPIRY_MIN: parseInt(process.env.MAGIC_LINK_EXPIRY_MIN || '15', 10),
  SMTP: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.FROM_EMAIL || 'Savant for TTOM <no-reply@example.com>'
  },
  DEV_LOG_MAGIC_LINK: process.env.DEV_LOG_MAGIC_LINK === 'true'
};
