const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../frontend/js/admin-battles.js'), 'utf8');

const LIST = () => ({ max_score: 100, battles: [{ id: 7, title: '<b>Sayt</b> battle', topic: 'Portfolio', ends_at: null, teams: [
    { team_id: 1, name: 'Alfa', submission: { link: 'https://github.com/alfa/x', note: '<i>izoh</i>' }, score: 80, comment: null },
    { team_id: 2, name: 'Beta', submission: { link: 'javascript:alert(1)', note: null }, score: null, comment: null },
    { team_id: 3, name: 'Gamma', submission: null, score: null, comment: null }] }] });
let windows = []; const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
async function boot(opts = {}) {
    const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only' });
    const w = dom.window; windows.push(w); w.config = { apiBaseUrl: 'https://api.test/api' };
    const calls = [];
    w.fetch = jest.fn(async (url, o = {}) => {
        const p = url.replace('https://api.test/api', ''); const method = o.method || 'GET'; calls.push({ p, method, body: o.body ? JSON.parse(o.body) : undefined });
        if (opts.status) return { ok: false, status: opts.status, json: async () => ({ error: opts.error || 'x' }) };
        if (p === '/admin/tournaments' && method === 'GET') return { ok: true, status: 200, json: async () => ({ tournaments: opts.noTournaments ? [] : [
            { id: 4, title: '<b>Kuz</b> kubogi', topic: 'Python', round_days: 2, status: 'open', teams: [{ team_id: 1, name: 'Alfa', group_no: null }, { team_id: 2, name: '<i>Beta</i>', group_no: null }], matches: [] },
            { id: 5, title: 'Bahor', topic: 'JS', round_days: 3, status: 'groups', next_round: 2, round_ready: opts.roundReady !== false, rounds_total: 3, groups_finished: false, teams: [{ team_id: 3, name: 'Gamma', group_no: 2 }], matches: [] }].concat(opts.playoff ? [Object.assign({ id: 6, title: 'Qish', topic: 'C', round_days: 2, status: 'playoffs', next_round: null, groups_finished: true, playoff_stage: 'semi', stage_finished: true, next_stage: 'final', champion: null, teams: [], matches: [] }, opts.playoff)] : []) }) };
        if (/^\/admin\/tournaments\/\d+\/questions$/.test(p) && method === 'GET') return { ok: true, status: 200, json: async () => ({ slots: opts.slots || {}, all_slots: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'quarter', 'semi', 'final'], limits: { min: 3, max: 20 } }) };
        if (/\/questions\/\w+$/.test(p) && method === 'PUT') return opts.qError ? { ok: false, status: 400, json: async () => ({ error: 'Question 2: choose the correct option' }) } : { ok: true, status: 200, json: async () => ({ ok: true }) };
        if (p.includes('/start-round') && opts.roundError) return { ok: false, status: 503, json: async () => ({ error: 'The AI that prepares quiz questions is not connected yet' }) };
        if (p.includes('/draw') && opts.drawError) return { ok: false, status: 400, json: async () => ({ error: 'Groups need 4, 6-8 or 12-16 teams; now there are 5' }) };
        if (p === '/admin/appeals' && method === 'GET') return { ok: true, status: 200, json: async () => ({ appeals: opts.noAppeals ? [] : [{ id: 3, battle_id: 7, battle_title: '<b>Jang</b>', team_name: '<i>Beta</i>', captain_name: 'Ali', reason: '<u>Savol xato</u>', status: 'open' }] }) };
        if (/^\/admin\/appeals\/\d+\/resolve$/.test(p) && opts.appealError) return { ok: false, status: 409, json: async () => ({ error: 'This objection has already been answered' }) };
        if (method === 'GET') return { ok: true, status: 200, json: async () => (opts.empty ? { battles: [], max_score: 100 } : LIST()) };
        if (p.endsWith('/finish') && opts.finishError) return { ok: false, status: 400, json: async () => ({ error: 'Score every team that handed in a project first' }) };
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });
    w.eval(src);
    const toast = jest.fn(); const onAuth = jest.fn(); const c = w.document.getElementById('c');
    await w.AdminBattles.render(c, 'tok', onAuth, toast); await tick();
    return { w, c, calls, toast, onAuth };
}
afterEach(() => { windows.forEach((w) => w.close()); windows = []; });
const submit = (form) => form.dispatchEvent(new form.ownerDocument.defaultView.Event('submit', { bubbles: true, cancelable: true }));

test('shows each team: text is never HTML, only https links are clickable, no-submission teams get 0', async () => {
    const { c } = await boot();
    expect(c.textContent).toContain('<b>Sayt</b> battle'); expect(c.querySelector('h3 b')).toBeNull();
    expect(c.textContent).toContain('<i>izoh</i>'); expect(c.querySelector('i')).toBeNull();
    const anchors = [...c.querySelectorAll('a')];
    expect(anchors).toHaveLength(1); expect(anchors[0].href).toBe('https://github.com/alfa/x'); expect(anchors[0].rel).toContain('noopener');
    expect(c.textContent).toContain('javascript:alert(1)');
    expect(c.querySelector('[data-team="3"]').textContent).toContain('0 ball beriladi');
    expect(c.querySelector('[data-team="3"] form')).toBeNull();
    expect(c.querySelector('[data-team="1"] input[type=number]').value).toBe('80');
});
test('saving a score sends the team, the whole number and the comment', async () => {
    const { c, calls, toast } = await boot();
    const f = c.querySelector('[data-team="2"] form'); f.querySelector('input[type=number]').value = '65'; f.querySelector('input[type=text]').value = 'Yaxshi';
    submit(f); await tick();
    expect(calls.find((x) => x.method === 'POST').body).toEqual({ team_id: 2, score: 65, comment: 'Yaxshi' });
    expect(calls.find((x) => x.method === 'POST').p).toBe('/admin/battles/7/score');
    expect(toast).toHaveBeenCalledWith('Ball saqlandi');
});
test('when the list cannot be loaded the page says so instead of breaking', async () => {
    const { c } = await boot({ status: 400, error: 'Score must be a whole number from 0 to 100' });
    // list failed to load: the page says so instead of breaking
    expect(c.textContent).toContain("yuklab bo'lmadi");
});
test('finishing needs two clicks; a server refusal is shown in Uzbek', async () => {
    const { c, calls } = await boot({ finishError: true });
    const fin = [...c.querySelectorAll('button')].find((b) => b.textContent === 'Yakunlash');
    fin.click(); await tick();
    expect(calls.some((x) => x.p.endsWith('/finish'))).toBe(false);
    fin.click(); await tick();
    expect(calls.some((x) => x.p === '/admin/battles/7/finish')).toBe(true);
    expect(c.textContent).toContain('har bir jamoani baholang');
});
test('empty list and lost session', async () => {
    expect((await boot({ empty: true })).c.textContent).toContain("baholashni kutayotgan battle yo'q");
    const lost = await boot({ status: 401 }); expect(lost.onAuth).toHaveBeenCalled();
});

describe('tournaments section', () => {
    test('lists tournaments as plain text; only an open one can be drawn or have teams removed', async () => {
        const { c } = await boot();
        const open = c.querySelector('[data-tournament="4"]'); const groups = c.querySelector('[data-tournament="5"]');
        expect(open.textContent).toContain('<b>Kuz</b> kubogi'); expect(c.querySelector('h3 b')).toBeNull();
        expect(open.textContent).toContain('<i>Beta</i>'); expect(open.querySelector('i')).toBeNull();
        expect([...open.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Chiqarish', 'Chiqarish', 'Qura tashlash', 'Savollar', 'Bekor qilish']);
        expect(groups.textContent).toContain('B guruhi');
        expect([...groups.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['2-turni boshlash', 'Savollar', 'Bekor qilish']);
    });
    test('creating needs a title and a topic and sends the round length', async () => {
        const { c, calls } = await boot();
        const f = [...c.querySelectorAll('form')].find((x) => x.textContent.includes('Yangi turnir'));
        submit(f); await tick();
        expect(calls.some((x) => x.method === 'POST' && x.p === '/admin/tournaments')).toBe(false);
        f.querySelector('input[aria-label="Turnir nomi"]').value = 'Kuz kubogi'; f.querySelector('input[aria-label="Mavzu"]').value = 'Python'; f.querySelector('select').value = '3';
        submit(f); await tick();
        expect(calls.find((x) => x.method === 'POST' && x.p === '/admin/tournaments').body).toEqual({ title: 'Kuz kubogi', topic: 'Python', round_days: 3 });
    });
    test('the draw needs two clicks; a refusal is shown in Uzbek', async () => {
        const { c, calls } = await boot({ drawError: true });
        const dr = [...c.querySelectorAll('button')].find((b) => b.textContent === 'Qura tashlash');
        dr.click(); await tick();
        expect(calls.some((x) => x.p.endsWith('/draw'))).toBe(false);
        dr.click(); await tick();
        expect(calls.find((x) => x.p === '/admin/tournaments/4/draw').method).toBe('POST');
        expect(c.textContent).toContain('4, 6–8 yoki 12–16 jamoa');
    });
    test('removing a team sends its id', async () => {
        const { c, calls } = await boot();
        c.querySelector('[data-tournament="4"] [data-team="2"] button').click(); await tick();
        expect(calls.find((x) => x.p === '/admin/tournaments/4/remove-team').body).toEqual({ team_id: 2 });
    });
});

describe('rounds', () => {
    const startBtn = (c) => [...c.querySelectorAll('[data-tournament="5"] button')].find((b) => /-turni boshlash|Aniqmi/.test(b.textContent));
    test('starting the next round needs two clicks and calls the right endpoint', async () => {
        const { c, calls } = await boot();
        const b = startBtn(c); expect(c.querySelector('[data-tournament="5"]').textContent).toContain('Keyingi: 2-tur (jami 3 tur)');
        b.click(); await tick();
        expect(calls.some((x) => x.p.endsWith('/start-round'))).toBe(false);
        b.click(); await tick();
        expect(calls.find((x) => x.p === '/admin/tournaments/5/start-round').method).toBe('POST');
    });
    test('while the previous round is still running the button is off and says why', async () => {
        const { c, calls } = await boot({ roundReady: false });
        const b = startBtn(c); expect(b.disabled).toBe(true);
        expect(c.querySelector('[data-tournament="5"]').textContent).toContain('Oldingi tur tugashini kuting');
        b.click(); b.click(); await tick();
        expect(calls.some((x) => x.p.endsWith('/start-round'))).toBe(false);
    });
    test('a missing AI is explained in Uzbek', async () => {
        const { c } = await boot({ roundError: true });
        const b = startBtn(c); b.click(); b.click(); await tick(60);
        expect(c.textContent).toContain('AI ulanmagan');
    });
});

describe('playoffs', () => {
    const btn = (c) => [...c.querySelectorAll('[data-tournament="6"] button')].find((b) => /boshlash|Aniqmi/.test(b.textContent));
    test('after the groups: one button starts the playoffs (two clicks, right endpoint)', async () => {
        const { c, calls } = await boot({ playoff: { status: 'groups', playoff_stage: null, stage_finished: false, next_stage: 'start' } });
        const b = btn(c); expect(b.textContent).toBe('Pley-offni boshlash');
        expect(c.querySelector('[data-tournament="6"]').textContent).toContain('Pley-offni boshlashingiz mumkin');
        b.click(); await tick();
        expect(calls.some((x) => x.p === '/admin/tournaments/6/start-round')).toBe(false);
        b.click(); await tick();
        expect(calls.find((x) => x.p === '/admin/tournaments/6/start-round').method).toBe('POST');
    });
    test('the next stage button is named after the stage; nothing to press while a stage is running', async () => {
        expect(btn((await boot({ playoff: {} })).c).textContent).toBe('Finalni boshlash');
        const run = await boot({ playoff: { stage_finished: false, next_stage: null } });
        expect(btn(run.c)).toBeUndefined();
        expect(run.c.querySelector('[data-tournament="6"]').textContent).toContain('Yarim final davom etmoqda');
    });
    test('the champion is shown as text', async () => {
        const { c } = await boot({ playoff: { status: 'finished', playoff_stage: 'final', next_stage: null, champion: { team_id: 1, name: '<b>Alfa</b>' } } });
        const card = c.querySelector('[data-tournament="6"]');
        expect(card.textContent).toContain('Chempion: <b>Alfa</b>'); expect(card.querySelector('b')).toBeNull();
    });
});

describe('question editor', () => {
    const open = async (opts) => { const t = await boot(opts); const b = [...t.c.querySelectorAll('[data-tournament="5"] button')].find((x) => x.textContent === 'Savollar'); b.click(); await tick(); await tick(); return Object.assign(t, { ed: t.c.querySelector('[data-editor="5"]') }); };
    const fill = (w, blockEl, q, opts, right, ex) => {
        const set = (n, v) => { n.value = v; };
        set(blockEl.querySelector('textarea'), q);
        const inputs = [...blockEl.querySelectorAll('input[type=text]')];
        opts.forEach((v, i) => set(inputs[i], v)); set(inputs[4], ex || '');
        blockEl.querySelectorAll('input[type=radio]')[right].checked = true;
    };
    const btn = (ed, text) => [...ed.querySelectorAll('button')].find((x) => x.textContent.startsWith(text));
    test('the "Savollar" button opens an editor that says the AI will make the questions when there are none', async () => {
        const { ed } = await open();
        expect(ed).not.toBeNull(); expect(ed.textContent).toContain("Savol yo'q: bu bosqich uchun AI tuzadi");
        expect([...ed.querySelectorAll('select option')].map((o) => o.textContent)).toContain('1-tur');
        expect([...ed.querySelectorAll('select option')].map((o) => o.textContent)).toContain('Final');
    });
    test('questions are saved to the chosen stage; the admin\'s text stays text', async () => {
        const { ed, calls, w } = await open();
        ed.querySelector('select').value = 'semi'; ed.querySelector('select').dispatchEvent(new w.Event('change'));
        for (let i = 0; i < 3; i++) btn(ed, "Savol qo'shish").click();
        const bl = [...ed.querySelectorAll('[data-editor] > div > div')].filter((n) => n.querySelector('textarea'));
        expect(bl).toHaveLength(3);
        bl.forEach((n, i) => fill(w, n, '<b>Savol ' + i + '</b>', ['a', 'b', 'c', 'd'], i, 'Izoh'));
        btn(ed, 'Saqlash').click(); await tick();
        const put = calls.find((x) => x.method === 'PUT');
        expect(put.p).toBe('/admin/tournaments/5/questions/semi');
        expect(put.body.questions).toHaveLength(3);
        expect(put.body.questions[1]).toEqual({ q: '<b>Savol 1</b>', options: ['a', 'b', 'c', 'd'], answer: 1, explanation: 'Izoh' });
        expect(ed.querySelector('b b')).toBeNull();
    });
    test('saved questions are shown again with the right option marked; removing one renumbers', async () => {
        const slots = { r1: [0, 1, 2].map((i) => ({ q: 'S' + i, options: ['a', 'b', 'c', 'd'], answer: 2, explanation: '' })) };
        const { ed } = await open({ slots });
        expect(ed.textContent).toContain('3 ta savol yozilgan');
        const first = ed.querySelector('textarea').parentNode;
        expect(first.querySelectorAll('input[type=radio]')[2].checked).toBe(true);
        [...ed.querySelectorAll('button')].find((x) => x.textContent === "O'chirish").click();
        expect(ed.textContent).toContain('2 ta savol yozilgan'); expect(ed.textContent).toContain('2-savol');
    });
    test('a server complaint is explained in Uzbek and nothing is lost', async () => {
        const { ed, w } = await open({ qError: true });
        for (let i = 0; i < 3; i++) btn(ed, "Savol qo'shish").click();
        btn(ed, 'Saqlash').click(); await tick();
        expect(ed.textContent).toContain("2-savol: to'g'ri variantni belgilang.");
        expect(ed.querySelectorAll('textarea')).toHaveLength(3);
    });
    test('"AI tuzsin" sends an empty list', async () => {
        const slots = { r1: [0, 1, 2].map((i) => ({ q: 'S' + i, options: ['a', 'b', 'c', 'd'], answer: 0, explanation: '' })) };
        const { ed, calls } = await open({ slots });
        btn(ed, "O'z savollarini").click(); await tick();
        expect(calls.find((x) => x.method === 'PUT').body).toEqual({ questions: [] });
        expect(ed.textContent).toContain("Savol yo'q");
    });
    test('the button opens and closes the editor', async () => {
        const { c } = await open();
        [...c.querySelectorAll('[data-tournament="5"] button')].find((x) => x.textContent === 'Savollar').click();
        expect(c.querySelector('[data-editor]')).toBeNull();
    });
});

describe('appeals', () => {
    const btn = (root, t) => [...root.querySelectorAll('button')].find((x) => x.textContent.startsWith(t));
    test('an open objection is shown as plain text', async () => {
        const { c } = await boot();
        const a = c.querySelector('[data-appeal="3"]');
        expect(a.textContent).toContain('<b>Jang</b>'); expect(a.textContent).toContain('<u>Savol xato</u>'); expect(a.textContent).toContain('Ali');
        expect(a.querySelector('b, i, u')).toBeNull();
    });
    test('no objections: a short note', async () => {
        const { c } = await boot({ noAppeals: true });
        expect(c.textContent).toContain("Javob kutayotgan e'tiroz yo'q");
    });
    test('a note is required, and the answer needs a second click', async () => {
        const { c, calls } = await boot();
        const a = c.querySelector('[data-appeal="3"]');
        btn(a, 'Qabul').click(); await tick();
        expect(c.textContent).toContain('Javob izohini yozing');
        a.querySelector('textarea').value = 'Tekshirdim';
        btn(a, 'Qabul').click(); expect(calls.find((x) => x.p.includes('/resolve'))).toBeUndefined();
        btn(a, 'Aniqmi').click(); await tick();
        expect(calls.find((x) => x.p === '/admin/appeals/3/resolve')).toMatchObject({ method: 'POST', body: { decision: 'accepted', note: 'Tekshirdim' } });
    });
    test('reject sends rejected; a server complaint is explained in Uzbek', async () => {
        const { c, calls } = await boot({ appealError: true });
        const a = c.querySelector('[data-appeal="3"]'); a.querySelector('textarea').value = 'Yoq';
        btn(a, 'Rad').click(); btn(a, 'Aniqmi').click(); await tick();
        expect(calls.find((x) => x.p.includes('/resolve')).body.decision).toBe('rejected');
        expect(c.textContent).toContain("Bu e'tirozga allaqachon javob berilgan");
    });
});
