const express = require('express');
const crypto = require('crypto');
const telegram = require('../utils/telegram');

const router = express.Router();

const CONTACT = () => ({
    email: process.env.CONTACT_EMAIL_PUBLIC || 'info.gatheredu@gmail.com',
    phone: process.env.CONTACT_PHONE_PUBLIC || '+998 90 472 61 35'
});

const HELP = () => {
    const c = CONTACT();
    return [
        'Gather Edu botiga xush kelibsiz!',
        '',
        'Buyruqlar:',
        '/aloqa - email va telefon',
        '/help - yordam',
        '',
        'Savolingizni shu yerga yozing, jamoamiz tez orada javob beradi.',
        '',
        `Email: ${c.email}`,
        `Telefon: ${c.phone}`
    ].join('\n');
};

function safeEqual(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// "[chat:123]" tag lets an admin reply to a forwarded message without any database
const TAG = /\[chat:(-?\d+)\]/g;
// The user's own text must never carry a tag: otherwise it could redirect the admin's answer to another chat
const stripTag = (t) => t.replace(/\[\s*chat\s*:/gi, '(chat:');
// The real tag is the LAST one in the forwarded message
const lastTag = (t) => { const all = [...String(t).matchAll(TAG)]; return all.length ? all[all.length - 1][1] : null; };

async function handleMessage(msg) {
    const chatId = msg.chat && msg.chat.id;
    if (!chatId) return;
    const text = typeof msg.text === 'string' ? msg.text.trim() : '';
    const isAdminChat = String(chatId) === String(process.env.TELEGRAM_ADMIN_CHAT_ID || '');
    // Only private chats and the team chat are served (ignore other groups the bot may be added to)
    if (!isAdminChat && msg.chat.type !== 'private') return;

    if (text === '/id') {
        return telegram.sendMessage(chatId, `Chat ID: ${chatId}`);
    }

    if (isAdminChat) {
        // Admin answers a forwarded message -> relay the answer to the original user
        const tagged = msg.reply_to_message && msg.reply_to_message.text && lastTag(msg.reply_to_message.text);
        if (tagged && text) {
            await telegram.sendMessage(tagged, text);
            return telegram.sendMessage(chatId, 'Javob yuborildi.');
        }
        return;
    }

    if (text === '/start' || text === '/help') return telegram.sendMessage(chatId, HELP());
    if (text === '/aloqa') {
        const c = CONTACT();
        return telegram.sendMessage(chatId, `Email: ${c.email}\nTelefon: ${c.phone}`);
    }
    if (!text) return telegram.sendMessage(chatId, 'Iltimos, savolingizni matn bilan yozing.');

    const from = msg.from || {};
    const who = [from.first_name, from.last_name].filter(Boolean).join(' ') || 'Noma\'lum';
    const handle = from.username ? ` (@${from.username})` : '';
    const forwarded = await telegram.notifyAdmin(`Telegram bot: ${who}${handle}\n\n${stripTag(text).slice(0, 3000)}\n\n[chat:${chatId}]`);
    return telegram.sendMessage(
        chatId,
        forwarded ? 'Xabaringiz qabul qilindi. Tez orada javob beramiz.' : `Hozir javob bera olmaymiz. Iltimos, emailga yozing: ${CONTACT().email}`
    );
}

// Telegram sends the secret in this header (set via setWebhook secret_token)
router.post('/webhook', async (req, res) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!telegram.isConfigured() || !secret) return res.sendStatus(404);
    if (!safeEqual(req.get('X-Telegram-Bot-Api-Secret-Token') || '', secret)) return res.sendStatus(403);

    // Always answer 200 quickly so Telegram does not retry; errors are only logged
    res.sendStatus(200);
    try {
        if (req.body && req.body.message) await handleMessage(req.body.message);
    } catch (error) {
        console.error('Telegram webhook error:', error.message);
    }
});

module.exports = router;
