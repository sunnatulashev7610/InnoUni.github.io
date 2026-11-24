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
            { id: 5, title: 'Bahor', topic: 'JS', round_days: 3, status: 'groups', teams: [{ team_id: 3, name: 'Gamma', group_no: 2 }], matches: [] }] }) };
        if (p.includes('/draw') && opts.drawError) return { ok: false, status: 400, json: async () => ({ error: 'Groups need 4, 6-8 or 12-16 teams; now there are 5' }) };
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
        expect([...open.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Chiqarish', 'Chiqarish', 'Qura tashlash', 'Bekor qilish']);
        expect(groups.textContent).toContain('B guruhi');
        expect([...groups.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Bekor qilish']);
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
