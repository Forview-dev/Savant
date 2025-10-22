import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

const devTransport = {
  async sendMail({ to, subject, text }) {
    console.log('\n\n===============================');
    console.log(`DEV LOGIN LINK for ${to}`);
    console.log(text);
    console.log('===============================\n\n');
    return { messageId: 'dev' };
  },
};

function createSmtpTransport() {
  if (!env.SMTP.host) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.SMTP.host,
    port: env.SMTP.port,
    secure: env.SMTP.secure,
    auth: env.SMTP.user
      ? { user: env.SMTP.user, pass: env.SMTP.pass }
      : undefined,
  });
}

const smtpTransport = createSmtpTransport();

if (!smtpTransport && env.NODE_ENV === 'production') {
  console.warn(
    'SMTP credentials are not configured. Magic link emails will be logged to the console.'
  );
}

export async function sendLoginEmail(toEmail, verifyUrl, req) {
  const expires = env.MAGIC_LINK_EXPIRY_MIN;
  const subject = 'Your login link — SOP Web App';
  const text = `Click to sign in:\n${verifyUrl}\nThis link expires in ${expires} minutes.`;
  const html = `
    <p>Click to sign in:</p>
    <p><a href="${verifyUrl}">${verifyUrl}</a></p>
    <p>This link expires in ${expires} minutes.</p>
  `;

  const transport = smtpTransport || devTransport;
  const info = await transport.sendMail({
    from: env.SMTP.from,
    to: toEmail,
    subject,
    text,
    html,
  });

  req.log.info(
    { to: toEmail, messageId: info.messageId, smtp: Boolean(smtpTransport) },
    'Magic link email sent.'
  );
}
