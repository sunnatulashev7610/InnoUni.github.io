const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const dataSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-data.js'), 'utf8');
const chatSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-team-chat.js'), 'utf8');
const teamsSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-teams.js'), 'utf8');

const DIRS = ['Dasturlash', 'Dizayn', 'Til', 'Fan', 'Biznes', 'Boshqa'];
const base = { description: null, captain_id: 5, captain_name: 'Sardor Aliyev', created_at: '2026-11-10T09:00:00.000Z', members: 3, my_status: null, is_captain: false, pending_requests: 0 };
const makeState = () => ({
    teams: [
        { ...base, id: 1, name: '<b>Python</b> Sprint', direction: 'Dasturlash', sphere: 'Veb dasturlash', goals: 'Loyiha qilish\nOlimpiadaga tayyorlanish', description: 'Hamma uchun' },
        { ...base, id: 2, name: 'IELTS Birga', direction: 'Til', sphere: 'IELTS', goals: '7 ball olish', my_status: 'active' },
        { ...base, id: 3, name: 'Mening jamoam', direction: 'Fan', sphere: 'Algebra', goals: 'Olimpiada', captain_id: 7, captain_name: 'Sam Test', members: 1, my_status: 'active', is_captain: true, pending_requests: 2 },
    ],
    members: [], isCaptain: false, createResult: null,
});

let windows = [];
afterEach(() => { windows.forEach((w) => w.close()); windows = []; });

function boot(state) {
    const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only', url: 'https://site.test/' });
    const w = dom.window; windows.push(w);
    w.config = { apiBaseUrl: 'https://api.test/api' };
    w.loadPage = jest.fn();
    const calls = [];
    w.fetch = jest.fn(async (url, opts = {}) => {
        const p = url.replace('https://api.test/api', ''); const method = opts.method || 'GET';
        const body = opts.body ? JSON.parse(opts.body) : undefined;
        calls.push({ path: p, method, body });
        let r = { body: { message: 'ok' } };
        if (method === 'GET' && p === '/teams') r = { body: { teams: state.teams, directions: DIRS } };
        else if (method === 'GET' && /^\/teams\/\d+$/.test(p)) {
            const t = state.teams.find((x) => '/teams/' + x.id === p);
            r = t ? { body: { team: t } } : { ok: false, status: 404, body: { error: 'Team not found' } };
        } else if (method === 'GET' && /\/members$/.test(p)) r = { body: { members: state.members, isCaptain: state.isCaptain, invite_mode: state.inviteMode || 'admin', limits: { maxMembers: 100, maxMessageLength: 5000 } } };
        else if (method === 'GET' && /\/messages/.test(p)) r = { body: { messages: state.messages || [], deleted: [], more: false, me: { is_admin: state.isCaptain, muted: false, muted_seconds: 0 } } };
        else if (method === 'POST' && /\/messages$/.test(p)) r = { status: 201, body: { message: { id: 99, body: body.body, created_at: '2026-11-10T09:00:00.000Z', mine: true, user_id: 7, is_admin: state.isCaptain } } };
        else if (method === 'POST' && p === '/teams') r = state.createResult || { status: 201, body: { id: 9 } };
        else if (method === 'POST' && /\/join$/.test(p)) state.teams.find((x) => '/teams/' + x.id + '/join' === p).my_status = 'pending';
        return { ok: r.ok !== false, status: r.status || 200, json: async () => r.body };
    });
    w.eval(dataSrc); w.eval(chatSrc); w.eval(teamsSrc);
    const c = w.document.getElementById('c');
    const session = { id: 7, token: 't', name: 'Sam Test', role: 'student' };
    const tick = () => new Promise((r) => setTimeout(r, 5));
    const flush = async () => { for (let i = 0; i < 6; i++) await tick(); };
    return { w, c, calls, flush, run: (page) => w.GEData.hydrate(page, c, session, () => {}, (e) => { throw e; }) };
}
const pane = (c, name) => c.querySelector(`[data-pane="${name}"]`);
const btn = (scope, text) => [...scope.querySelectorAll('button')].find((b) => b.textContent === text);
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.Event('click', { bubbles: true }));
const submit = (form) => form.dispatchEvent(new form.ownerDocument.defaultView.Event('submit', { cancelable: true, bubbles: true }));
const setVal = (c, id, v) => { c.querySelector('#' + id).value = v; };

describe('teams list', () => {
    test('each card shows direction, sphere, goal, who opened it, when and the member count; text is escaped', async () => {
        const { c, run } = boot(makeState());
        await run('jamoalar');
        const first = pane(c, 'all').querySelectorAll('.pg-item')[0];
        expect(first.textContent).toContain('Dasturlash');
        expect(first.textContent).toContain('Soha: Veb dasturlash');
        expect(first.textContent).toContain('Maqsad: Loyiha qilish');
        expect(first.textContent).toContain('Sardor Aliyev');
        expect(first.textContent).toContain("3 a'zo");
        expect(first.textContent).toMatch(/2026|10/); // the opening date
        expect(first.querySelector('h3 b')).toBeNull();
        expect(first.querySelector('h3').textContent).toBe('<b>Python</b> Sprint');
    });

    test('status pills and buttons follow the viewer: stranger, member, captain', async () => {
        const { c, run } = boot(makeState());
        await run('jamoalar');
        const [a, b, cap] = pane(c, 'all').querySelectorAll('.pg-item');
        expect(btn(a, "So'rov yuborish")).toBeTruthy();
        expect(btn(a, 'Batafsil')).toBeTruthy();
        expect(b.textContent).toContain("A'zosiz");
        expect(btn(b, 'Chatga kirish')).toBeTruthy();
        expect(btn(b, "So'rov yuborish")).toBeUndefined();
        expect(cap.textContent).toContain('Admin');
        expect(cap.textContent).toContain("2 ta yangi so'rov");
    });

    test('direction chips filter the cards', async () => {
        const { c, run } = boot(makeState());
        await run('jamoalar');
        expect(pane(c, 'all').querySelectorAll('.pg-item')).toHaveLength(3);
        click(btn(pane(c, 'all'), 'Til'));
        const left = pane(c, 'all').querySelectorAll('.pg-item');
        expect(left).toHaveLength(1);
        expect(left[0].textContent).toContain('IELTS Birga');
        click(btn(pane(c, 'all'), 'Fan'));
        click(btn(pane(c, 'all'), 'Dizayn'));
        expect(pane(c, 'all').textContent).toContain("Bu yo'nalishda jamoa yo'q");
    });

    test('"Mening jamoalarim" lists only my teams', async () => {
        const { c, run } = boot(makeState());
        await run('jamoalar');
        const mine = pane(c, 'mine').querySelectorAll('.pg-item');
        expect([...mine].map((x) => x.querySelector('h3').textContent)).toEqual(['IELTS Birga', 'Mening jamoam']);
    });

    test('a join request sends the anonymous choice and the list refreshes', async () => {
        const { c, calls, flush, run } = boot(makeState());
        await run('jamoalar');
        const card = pane(c, 'all').querySelectorAll('.pg-item')[0];
        card.querySelector('input[type=checkbox]').checked = true;
        click(btn(card, "So'rov yuborish")); await flush();
        const join = calls.find((x) => x.method === 'POST');
        expect(join).toMatchObject({ path: '/teams/1/join', body: { anonymous: true } });
        expect(calls.filter((x) => x.method === 'GET' && x.path === '/teams')).toHaveLength(2);
        expect(pane(c, 'all').querySelectorAll('.pg-item')[0].textContent).toContain("So'rov yuborilgan");
    });

    test('"Batafsil" opens the team page', async () => {
        const { w, c, run } = boot(makeState());
        await run('jamoalar');
        click(btn(pane(c, 'all').querySelectorAll('.pg-item')[0], 'Batafsil'));
        expect(w.GEData.ctx.teamId).toBe(1);
        expect(w.loadPage.mock.calls[0][0]).toBe('team-detail');
    });
});

describe('open a team', () => {
    const fill = (c, extra = {}) => {
        setVal(c, 'tmNewName', extra.name ?? 'Yangi jamoa'); setVal(c, 'tmNewDir', extra.dir ?? 'Til');
        setVal(c, 'tmNewSphere', extra.sphere ?? 'IELTS'); setVal(c, 'tmNewGoals', extra.goals ?? '7 ball\nSpeaking');
    };

    test('shows what is added automatically: who opened it, the date and the member count', async () => {
        const { c, run } = boot(makeState());
        await run('jamoalar');
        const text = pane(c, 'create').textContent;
        expect(text).toContain('Sam Test');
        expect(text).toContain("A'zolar soni");
        expect(text).toContain('1 (siz, admin)');
        expect(text).toContain('Ochilgan sana');
    });

    test('offers the directions from the server', async () => {
        const { c, run } = boot(makeState());
        await run('jamoalar');
        expect([...c.querySelectorAll('#tmNewDir option')].map((o) => o.value)).toEqual(['', ...DIRS]);
    });

    test('direction, sphere, goals and name are required before anything is sent', async () => {
        const { c, calls, flush, run } = boot(makeState());
        await run('jamoalar');
        const form = c.querySelector('#tmNewName').form;
        const msg = () => form.querySelector('[role=alert]').textContent;
        fill(c, { name: ' ' }); submit(form); await flush(); expect(msg()).toMatch(/nomini/);
        fill(c, { dir: '' }); submit(form); await flush(); expect(msg()).toMatch(/Yo'nalishni/);
        fill(c, { sphere: ' ' }); submit(form); await flush(); expect(msg()).toMatch(/Sohani/);
        fill(c, { goals: ' ' }); submit(form); await flush(); expect(msg()).toMatch(/maqsad/);
        expect(calls.some((x) => x.method === 'POST')).toBe(false);
    });

    test('a valid form sends everything and then shows my teams', async () => {
        const state = makeState();
        const { c, calls, flush, run } = boot(state);
        await run('jamoalar');
        fill(c); setVal(c, 'tmNewDesc', 'Qisqacha');
        submit(c.querySelector('#tmNewName').form); await flush();
        expect(calls.find((x) => x.method === 'POST' && x.path === '/teams').body).toEqual({
            name: 'Yangi jamoa', direction: 'Til', sphere: 'IELTS', goals: '7 ball\nSpeaking', description: 'Qisqacha',
        });
        expect(pane(c, 'mine').hidden).toBe(false);
        expect(pane(c, 'all').hidden).toBe(true);
        expect(c.ownerDocument.body.textContent).toContain('jamoasi ochildi');
    });

    test('a taken name and the 5-team limit are explained, the form keeps its values', async () => {
        const state = makeState();
        const { c, flush, run } = boot(state);
        await run('jamoalar');
        const form = () => c.querySelector('#tmNewName').form;
        const msg = () => form().querySelector('[role=alert]').textContent;
        state.createResult = { ok: false, status: 409, body: { error: 'Team name already taken' } };
        fill(c); submit(form()); await flush();
        expect(msg()).toBe('Bu nom band. Boshqa nom tanlang.');
        expect(c.querySelector('#tmNewSphere').value).toBe('IELTS');
        state.createResult = { ok: false, status: 400, body: { error: 'You can open at most 5 teams' } };
        submit(form()); await flush();
        expect(msg()).toContain('5 ta jamoa');
        expect(form().querySelector('button[type=submit]').disabled).toBe(false);
    });
});

describe('team page', () => {
    const members = [
        { user_id: 5, name: 'Sardor Aliyev', status: 'active', is_admin: true },
        { user_id: 8, name: 'Vali Karimov', status: 'active' },
        { user_id: null, name: 'Anonim', status: 'active' },
    ];

    test('shows who opened it, the date, the member count, sphere and the goals one by one', async () => {
        const state = makeState(); state.members = members;
        const { w, c, run } = boot(state); w.GEData.ctx.teamId = 1;
        await run('team-detail');
        expect(c.textContent).toContain('Sardor Aliyev');
        expect(c.textContent).toContain('Ochilgan sana');
        expect(c.textContent).toContain('Veb dasturlash');
        expect([...c.querySelectorAll('.pg-row b')].map((b) => b.textContent)).toEqual(expect.arrayContaining(['Loyiha qilish', 'Olimpiadaga tayyorlanish']));
        expect(c.querySelector('h2').textContent).toBe('<b>Python</b> Sprint');
        expect(c.querySelector('h2 b')).toBeNull();
    });

    test('a visitor can ask to join, sees no requests and no remove buttons; anonymous members stay hidden', async () => {
        const state = makeState(); state.members = members;
        const { w, c, run } = boot(state); w.GEData.ctx.teamId = 1;
        await run('team-detail');
        expect(btn(c, "So'rov yuborish")).toBeTruthy();
        expect(c.textContent).not.toContain("Qo'shilish so'rovlari");
        expect(btn(c, 'Chiqarish')).toBeUndefined();
        expect(c.textContent).toContain('Anonim');
        expect([...c.querySelectorAll('.pg-av')].some((a) => a.textContent === '?')).toBe(true);
    });

    test('the captain accepts a request, declines with a second click, and can remove members but not themselves', async () => {
        const state = makeState(); state.isCaptain = true;
        state.teams[0].is_captain = true; state.teams[0].my_status = 'active';
        state.members = [
            { user_id: 5, name: 'Sardor Aliyev', status: 'active', is_admin: true },
            { user_id: 8, name: 'Vali Karimov', status: 'active' },
            { user_id: 11, name: 'Ali <i>Valiyev</i>', status: 'pending' },
        ];
        const { w, c, calls, flush, run } = boot(state); w.GEData.ctx.teamId = 1;
        await run('team-detail');
        expect(c.textContent).toContain("Qo'shilish so'rovlari");
        expect(c.querySelector('.pg-row i')).toBeNull();                 // the name is text, not markup
        expect(c.querySelectorAll('.pg-row').length).toBeGreaterThan(0);
        expect([...c.querySelectorAll('button')].filter((b) => b.textContent === 'Chiqarish')).toHaveLength(1); // only Vali, not the captain

        click(btn(c, 'Rad etish'));
        expect(calls.some((x) => x.method === 'DELETE')).toBe(false);   // first click only asks
        expect(btn(c, 'Aniqmi?')).toBeTruthy();
        click(btn(c, 'Aniqmi?')); await flush();
        expect(calls.find((x) => x.method === 'DELETE')).toMatchObject({ path: '/teams/1/members/11' });

        click(btn(c, 'Qabul qilish')); await flush();
        expect(calls.find((x) => x.method === 'POST' && /accept/.test(x.path)).path).toBe('/teams/1/members/11/accept');
    });

    test('a member sees the chat first, can send a message, and has no admin tabs', async () => {
        const state = makeState(); state.members = members; state.messages = [{ id: 1, body: 'Salom <b>hamma</b>', created_at: '2026-11-10T09:00:00.000Z', mine: false, user_id: 8, name: 'Vali Karimov', is_admin: false }];
        const { w, c, calls, flush, run } = boot(state); w.GEData.ctx.teamId = 2;
        await run('team-detail'); await flush();
        expect(pane(c, 'chat').hidden).toBe(false);
        expect(c.textContent).toContain('Salom <b>hamma</b>');
        expect(c.querySelector('[data-pane=chat] b')).toBeNull();
        expect(pane(c, 'settings')).toBeNull();
        const ta = pane(c, 'chat').querySelector('textarea'); ta.value = 'Yangi xabar';
        submit(ta.form); await flush();
        expect(calls.find((x) => x.method === 'POST' && /messages$/.test(x.path)).body).toEqual({ body: 'Yangi xabar' });
        expect(c.textContent).toContain('Yangi xabar');
        expect(btn(c, 'Jamoadan chiqish')).toBeTruthy();
    });

    test('the admin gets settings, can invite, and deleting the team needs the typed name', async () => {
        const state = makeState(); state.isCaptain = true; state.members = members;
        Object.assign(state.teams[0], { is_captain: true, my_status: 'active' });
        const { w, c, calls, flush, run } = boot(state); w.GEData.ctx.teamId = 1;
        await run('team-detail'); await flush();
        expect(pane(c, 'settings')).toBeTruthy();
        expect(btn(c, 'Jamoadan chiqish')).toBeUndefined();
        setVal(c, 'tmInviteEmail', 'x@y.uz'); submit(c.querySelector('#tmInviteEmail').form); await flush();
        expect(calls.find((x) => /\/invite$/.test(x.path)).body).toEqual({ email: 'x@y.uz' });
        const del = btn(pane(c, 'settings'), "Jamoani o'chirish");
        expect(del.disabled).toBe(true);
        setVal(c, 'tsDeleteName', '<b>Python</b> Sprint');
        c.querySelector('#tsDeleteName').dispatchEvent(new w.Event('input'));
        expect(del.disabled).toBe(false);
        click(del); await flush();
        expect(calls.find((x) => x.method === 'DELETE' && x.path === '/teams/1')).toBeTruthy();
    });

    test('an unknown team shows a message and a way back', async () => {
        const { w, c, run } = boot(makeState()); w.GEData.ctx.teamId = 99;
        await run('team-detail');
        expect(c.textContent).toContain('Jamoa topilmadi');
        click(btn(c, '← Jamoalarga qaytish'));
        expect(w.loadPage.mock.calls[0][0]).toBe('jamoalar');
    });
});

describe('wiring', () => {
    test('the dashboard loads the script and has Teams switched on', () => {
        const html = fs.readFileSync(path.join(root, 'secondary-pages/dashboard/dashboard.html'), 'utf8');
        expect(html).toContain('frontend/js/dashboard-teams.js');
        expect(html.indexOf('dashboard-team-chat.js')).toBeGreaterThan(-1);
        expect(html.indexOf('dashboard-team-chat.js')).toBeLessThan(html.indexOf('dashboard-teams.js'));
        expect(html).toMatch(/var FEATURES = \{ teams: true, library: false \}/);
    });

    test('the demo form has the same fields', () => {
        const html = fs.readFileSync(path.join(root, 'secondary-pages/dashboard/pages/jamoalar.html'), 'utf8');
        ['tmCat', 'tmSphere', 'tmGoals'].forEach((id) => expect(html).toContain(`id="${id}"`));
    });

    test('the page script never writes user text through innerHTML', () => {
        expect(teamsSrc).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
    });
});
