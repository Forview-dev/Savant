// src/utils/mailer.js
const nodemailer = require('nodemailer');
const { SMTP, DEV_LOG_MAGIC_LINK } = require('../config');

let transporter = null;
if (SMTP.host && SMTP.user) {
  transporter = nodemailer.createTransport({
    host: SMTP.host,
    port: SMTP.port,
    secure: SMTP.port === 465,
    auth: {
      user: SMTP.user,
      pass: SMTP.pass
    }
  });
}

async function sendMagicLinkEmail({ to, link }) {
  const subject = 'Sign in to Savant for TTOM';
  const text = `Click this link to sign in (valid for a short time):\n\n${link}\n\nIf you didn't request this, ignore this email.`;
  const html = `<p>Click this link to sign in (valid for a short time):</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, ignore this email.</p>`;

  if (DEV_LOG_MAGIC_LINK) {
    console.log('[DEV] Magic link for', to, link);
    return;
  }

  if (!transporter) {
    throw new Error('No SMTP transporter configured. Set SMTP_* env vars.');
  }

  await transporter.sendMail({
    from: SMTP.from,
    to,
    subject,
    text,
    html
  });
}

module.exports = { sendMagicLinkEmail };
