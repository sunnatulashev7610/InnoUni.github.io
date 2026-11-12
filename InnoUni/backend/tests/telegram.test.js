process.env.JWT_SECRET = 'test-secret-test-secret-123';
delete process.env.EMAIL_USER;
delete process.env.EMAIL_PASS;

const request = require('supertest');
const app = require('../server');

const SECRET = 'hook-secret_1';
const post = (body, secret = SECRET) => {
    const r = request(app).post('/api/telegram/webhook').send(body);
    return secret === null ? r : r.set('X-Telegram-Bot-Api-Secret-Token', secret);
};
const private_ = (text, id = 111) => ({ message: { chat: { id, type: 'private' }, from: { first_name: 'Ali', username: 'ali' }, text } });
const wait = () => new Promise((r) => setTimeout(r, 20));

let sent;
beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'TOKEN';
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    process.env.TELEGRAM_ADMIN_CHAT_ID = '999';
    sent = [];
    global.fetch = jest.fn(async (url, opts) => {
        sent.push({ url, body: JSON.parse(opts.body) });
        return { ok: true, json: async () => ({ ok: true, result: {} }) };
    });
});
afterAll(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_ADMIN_CHAT_ID;
});

describe('telegram webhook', () => {
    test('404 when the bot is not configured', async () => {
        delete process.env.TELEGRAM_BOT_TOKEN;
        expect((await post(private_('/start'))).status).toBe(404);
    });

    test('403 without or with a wrong secret', async () => {
        expect((await post(private_('/start'), null)).status).toBe(403);
        expect((await post(private_('/start'), 'nope')).status).toBe(403);
        expect(sent).toHaveLength(0);
    });

    test('/start answers with contact details', async () => {
        expect((await post(private_('/start'))).status).toBe(200);
        await wait();
        expect(sent[0].body.chat_id).toBe(111);
        expect(sent[0].body.text).toContain('info.gatheredu@gmail.com');
        expect(sent[0].body.text).toContain('+998 90 472 61 35');
    });

    test('a question is forwarded to the team chat with a reply tag', async () => {
        await post(private_('Kurs narxi qancha?'));
        await wait();
        expect(sent[0].body.chat_id).toBe('999');
        expect(sent[0].body.text).toContain('Kurs narxi qancha?');
        expect(sent[0].body.text).toContain('[chat:111]');
        expect(sent[1].body.chat_id).toBe(111);
    });

    test('an admin reply to a forwarded message goes back to the user', async () => {
        await post({ message: { chat: { id: 999, type: 'group' }, text: 'Bepul', reply_to_message: { text: 'x\n\n[chat:111]' } } });
        await wait();
        expect(sent[0].body).toMatchObject({ chat_id: '111', text: 'Bepul' });
    });

    test('other groups are ignored', async () => {
        await post({ message: { chat: { id: 5, type: 'supergroup' }, text: 'hi' } });
        await wait();
        expect(sent).toHaveLength(0);
    });
});

describe('contact form with Telegram', () => {
    test('is delivered to Telegram when email is not configured', async () => {
        const res = await request(app).post('/api/contact').send({ name: 'Vali', email: 'v@example.com', message: 'Salom' });
        expect(res.status).toBe(200);
        expect(sent[0].body.text).toContain('Vali');
        expect(sent[0].body.chat_id).toBe('999');
    });

    test('503 when no channel is configured', async () => {
        delete process.env.TELEGRAM_BOT_TOKEN;
        const res = await request(app).post('/api/contact').send({ name: 'Vali', email: 'v@example.com', message: 'Salom' });
        expect(res.status).toBe(503);
    });
});
