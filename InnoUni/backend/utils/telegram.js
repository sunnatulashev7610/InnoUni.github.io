// Minimal Telegram Bot API client (no extra dependency: Node 18+ has global fetch).
const API = 'https://api.telegram.org';

function isConfigured() {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

async function call(method, payload) {
    const res = await fetch(`${API}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
        throw new Error(`Telegram ${method} failed: ${data.description || res.status}`);
    }
    return data.result;
}

// Plain text only (no parse_mode), so user text can never break or inject formatting
function sendMessage(chatId, text, extra = {}) {
    return call('sendMessage', { chat_id: chatId, text: String(text).slice(0, 4000), ...extra });
}

function setWebhook(url, secretToken) {
    return call('setWebhook', { url, secret_token: secretToken, allowed_updates: ['message'] });
}

// Sends to the team chat. Returns false when the bot or the chat is not configured.
async function notifyAdmin(text) {
    if (!isConfigured() || !process.env.TELEGRAM_ADMIN_CHAT_ID) return false;
    await sendMessage(process.env.TELEGRAM_ADMIN_CHAT_ID, text);
    return true;
}

module.exports = { isConfigured, sendMessage, setWebhook, notifyAdmin };
