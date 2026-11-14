// Sends e-mail to users (verification, password reset).
// Render's free plan blocks SMTP ports, so the preferred way is an HTTPS mail API (Brevo):
//   BREVO_API_KEY + MAIL_FROM (a sender verified in Brevo).
// Fallback: SMTP through nodemailer (EMAIL_USER / EMAIL_PASS), which works on hosts that allow SMTP.
const { escapeHtml } = require('./escapeHtml');

const brevoReady = () => Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
const smtpReady = () => Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
const isConfigured = () => brevoReady() || smtpReady();

function htmlOf(text) {
    return '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5">' +
        escapeHtml(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\r?\n/g, '<br>') + '</div>';
}

async function sendMail({ to, subject, text }) {
    if (brevoReady()) {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ sender: { name: 'Gather Edu', email: process.env.MAIL_FROM }, to: [{ email: to }], subject, textContent: text, htmlContent: htmlOf(text) })
        });
        if (!res.ok) throw new Error(`Mail API failed: ${res.status}`);
        return true;
    }
    if (smtpReady()) {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({ service: process.env.EMAIL_SERVICE || 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
        await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, text, html: htmlOf(text) });
        return true;
    }
    return false;
}

module.exports = { isConfigured, sendMail };
