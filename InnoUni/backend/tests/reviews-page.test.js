const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../..');
const dataSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-data.js'), 'utf8');
const src = fs.readFileSync(path.join(root, 'frontend/js/dashboard-reviews.js'), 'utf8');

const summary = { average: 4.5, count: 2, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } };
const base = (over) => Object.assign({ summary, reviews: [{ id: 1, author: 'Ali K.', rating: 5, comment: '<b>zo\'r</b>', created_at: '2026-11-01T10:00:00Z', mine: false }], mine: null, can_review: true, limits: { maxComment: 500 } }, over);
let windows = [];
const tick = () => new Promise((r) => setTimeout(r, 10));

async function boot(data, onSend) {
    const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only' });
    const w = dom.window; windows.push(w);
    w.config = { apiBaseUrl: 'https://api.test/api' };
    w.fetch = jest.fn(async (url, o) => {
        if (o && o.method && o.method !== 'GET') return onSend ? onSend(url, o) : { ok: true, status: 200, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => data };
    });
    w.eval(dataSrc); w.eval(src);
    const card = w.GEData.reviews.card(7, { token: 't' });
    w.document.getElementById('c').appendChild(card);
    await tick();
    return { w, card };
}
afterEach(() => { windows.forEach((w) => w.close()); windows = []; });

test('label for the course cards', async () => {
    const { w } = await boot(base());
    expect(w.GEData.reviews.label(4.5, 12)).toBe('★ 4.5 (12)');
    expect(w.GEData.reviews.label(null, 0)).toBe('Hali baho yo\'q');
});

test('shows the average, the bars and the comments as plain text', async () => {
    const { card } = await boot(base());
    expect(card.textContent).toContain('4.5');
    expect(card.textContent).toContain('2 ta baho');
    expect(card.querySelector('b + span, b')).not.toBeNull();
    expect(card.innerHTML).not.toContain('<b>zo');
    expect(card.textContent).toContain('<b>zo\'r</b>');
});

test('a student must pick stars, then the rating and comment are sent', async () => {
    const { w, card } = await boot(base());
    const form = card.querySelector('form');
    form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
    expect(card.textContent).toContain('yulduz tanlang');
    expect(w.fetch.mock.calls.some(([, o]) => o && o.method === 'PUT')).toBe(false);
    card.querySelectorAll('[role=radio]')[3].click();
    card.querySelector('textarea').value = 'Yaxshi kurs';
    form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
    const put = w.fetch.mock.calls.find(([, o]) => o && o.method === 'PUT');
    expect(put[0]).toContain('/course-reviews/courses/7');
    expect(JSON.parse(put[1].body)).toEqual({ rating: 4, comment: 'Yaxshi kurs' });
});

test('no form for someone who cannot rate (teacher, not enrolled)', async () => {
    const { card } = await boot(base({ can_review: false }));
    expect(card.querySelector('form')).toBeNull();
    expect(card.textContent).toContain('Ali K.');
});

test('own rating is prefilled and can be removed', async () => {
    const { w, card } = await boot(base({ mine: { rating: 3, comment: 'ok' } }));
    expect(card.querySelector('textarea').value).toBe('ok');
    expect([...card.querySelectorAll('[role=radio]')].map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false', 'false']);
    const del = [...card.querySelectorAll('button')].find((b) => /o'chirish/.test(b.textContent));
    del.click(); del.click(); await tick();
    expect(w.fetch.mock.calls.some(([, o]) => o && o.method === 'DELETE')).toBe(true);
});

test('empty course says so', async () => {
    const { card } = await boot(base({ summary: { average: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }, reviews: [], can_review: false }));
    expect(card.textContent).toContain('Hali baho yo\'q');
    expect(card.textContent).toContain('Hali fikr yozilmagan');
});
