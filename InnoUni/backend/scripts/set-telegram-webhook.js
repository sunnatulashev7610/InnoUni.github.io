// Usage: node scripts/set-telegram-webhook.js https://gatheredu-io.onrender.com
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in backend/.env (or the environment).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const telegram = require('../utils/telegram');

const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!base || !telegram.isConfigured() || !process.env.TELEGRAM_WEBHOOK_SECRET) {
    console.error('Usage: node scripts/set-telegram-webhook.js <public-api-url> (token and secret must be set)');
    process.exit(1);
}
telegram.setWebhook(`${base}/api/telegram/webhook`, process.env.TELEGRAM_WEBHOOK_SECRET)
    .then(() => console.log('Webhook set:', `${base}/api/telegram/webhook`))
    .catch((e) => { console.error(e.message); process.exit(1); });
