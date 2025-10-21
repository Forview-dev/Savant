import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

const isProd = env.NODE_ENV === 'production';

const devTransport = {
  async sendMail({ to, subject, text }) {
    console.log('\n\n===============================');
    console.log(`DEV LOGIN LINK for ${to}`);
    console.log(text);
    console.log('===============================\n\n');
    return { messageId: 'dev' };
  },
};

const smtpTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

export async function sendLoginEmail(toEmail, verifyUrl, req) {
  const subject = 'Your login link — SOP Web App';
  const text = `Click to sign in:\n${verifyUrl}\nThis link expires in 15 minutes.`;
  const html = `
    <p>Click to sign in:</p>
    <p><a href="${verifyUrl}">${verifyUrl}</a></p>
    <p>This link expires in 15 minutes.</p>
  `;

  const transport = isProd ? smtpTransport : devTransport;
  const info = await transport.sendMail({
    from: 'no-reply@sop-app.local',
    to: toEmail,
    subject,
    text,
    html,
  });

  req.log.info(
    { to: toEmail, messageId: info.messageId },
    'Magic link email (dev or prod) sent.'
  );
}
