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

const USE_SECURE = String(env.SMTP_PORT) === '465';
const smtpTransport = nodemailer.createTransport({
  host: env.SMTP_HOST,                        // in-v3.mailjet.com
  port: Number(env.SMTP_PORT || 587),
  secure: USE_SECURE,                         // true for 465, false otherwise
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  connectionTimeout: 15000,                   // 15s -> fail fast
  greetingTimeout: 15000,
  socketTimeout: 20000,
  tls: {
    servername: 'in-v3.mailjet.com',          // SNI
    minVersion: 'TLSv1.2'
    // DO NOT put rejectUnauthorized:false here (you already disabled globally during DB debugging; remove that when you switch to CA)
  }
});


console.log('[MAIL] init', {
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: String(env.SMTP_PORT) === '465',
  from: env.MAIL_FROM
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
