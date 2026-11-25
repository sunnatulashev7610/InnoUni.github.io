const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const dataSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-data.js'), 'utf8');
const chatSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-team-chat.js'), 'utf8');
const teamsSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-teams.js'), 'utf8');

const DIRS = ['Dasturlash', 'Dizayn', 'Til', 'Fan', 'Biznes', 'Boshqa'];
const base = { description: null, captain_id: 5, captain_name: 'Sardor Aliyev', created_at: '2026-11-10T09:00:00.000Z', members: 3, my_status: null, is_captain: false, pending_requests: 0, recruiting: true, rating: 0, rank: null, activity: { writers: 0, messages: 0 } };
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
        if (/^\/tournaments$/.test(p)) {
            r = { body: state.tournaments === undefined ? { tournaments: [], my_admin_teams: [] } : state.tournaments };
        } else if (/^\/tournaments\/\d+\/(register|withdraw)/.test(p)) {
            r = state.regFails ? { ok: false, status: 400, body: { error: 'A team needs at least 3 active members' } } : { body: { registered: true } };
        } else if (/^\/battles\/teams\/\d+\/record/.test(p)) {
            r = { body: { rating: 1216, league: 'Oltin', played: 4, wins: 2, badges: [{ id: 'first_win', name: "Birinchi g'alaba" }], trophies: [{ battle_id: 1, title: '<b>Kubok</b> battle', ends_at: null }],
                recent: [{ battle_id: 8, title: 'x', ends_at: null, opponent: '<i>Beta</i>', score: 5, opponent_score: 3, result: 'win' }, { battle_id: 7, title: 'y', ends_at: null, opponent: 'Gamma', score: 4, opponent_score: 4, result: 'draw' }, { battle_id: 6, title: 'z', ends_at: null, opponent: 'Delta', score: 1, opponent_score: 2, result: 'loss' }], streak: 2 } };
        } else if (/^\/battles\/leaderboard/.test(p)) {
            r = { body: { teams: [{ team_id: 3, name: '<i>Alfa</i>', rating: 1216, league: 'Oltin', played: 4, wins: 2 }] } };
        } else if (/^\/battles\/\d+\/quiz/.test(p)) {
            const fin = state.quizFinished; r = { body: { status: fin ? 'finished' : 'active', team_id: 3, total: 2, answered: 0, questions: [
                Object.assign({ id: 11, position: 1, question: '<i>2+2</i> nechchi?', options: ['3', '4', '5', '6'], my_choice: fin ? 1 : null }, fin ? { correct: 1, explanation: 'Ikki va ikki' } : {}),
                Object.assign({ id: 12, position: 2, question: 'Ikkinchi?', options: ['a', 'b', 'c', 'd'], my_choice: null }, fin ? { correct: 0, explanation: 'x' } : {}) ] } };
        } else if (/^\/battles\/\d+\/submit/.test(p)) {
            r = state.submitFails ? { ok: false, status: 400, body: { error: 'Link must be a valid https address' } } : { body: { saved: true } };
        } else if (/^\/battles\/\d+\/answer/.test(p)) {
            r = state.answerFails ? { ok: false, status: 409, body: { error: 'Already answered' } } : { body: { saved: true, answered: 1 } };
        } else if (/^\/battles/.test(p)) {
            const list = state.battles = state.battles || [{ id: 1, title: '<b>Python</b> battle', topic: 'Python asoslari', kind: 'quiz', status: 'invited', duration_days: 2, starts_at: null, ends_at: null, host_team_id: 3, teams: [{ team_id: 3, name: 'Host jamoa', state: 'host' }, { team_id: 1, name: 'Python Klub', state: 'invited' }], is_host_admin: false, can_respond: true }];
            if (method === 'GET') r = { body: { battles: list } };
            else if (method === 'POST' && p === '/battles') { list.push({ id: 2, title: body.title, topic: body.topic, kind: body.kind, status: 'invited', duration_days: body.duration_days, host_team_id: body.host_team_id, teams: [], is_host_admin: true, can_respond: false }); r = { status: 201, body: { id: 2 } }; }
            else { const x = list.find((q) => p.startsWith('/battles/' + q.id + '/')); if (p.endsWith('/respond')) { x.can_respond = false; x.teams[1].state = body.accept ? 'accepted' : 'declined'; } r = { body: {} }; }
        } else if (/\/events/.test(p)) {
            const evs = state.events = state.events || [{ id: 1, title: '<b>Haftalik</b> uchrashuv', place: 'Kutubxona', note: null, starts_at: new Date(Date.now() + 2 * 86400000).toISOString(), going: 1, i_go: false }];
            if (method === 'GET') r = { body: { events: evs } };
            else if (method === 'POST' && /\/going$/.test(p)) { evs[0].i_go = true; evs[0].going++; r = { body: { i_go: true } }; }
            else if (method === 'POST') { evs.push({ id: 2, title: body.title, place: body.place, note: body.note, starts_at: body.starts_at, going: 0, i_go: false }); r = { status: 201, body: { id: 2 } }; }
            else r = { body: { message: 'Deleted' } };
        } else if (/\/resources/.test(p)) {
            const res = state.resources = state.resources || [{ id: 1, title: '<i>Python</i> darsi', url: 'https://x.uz/p', note: 'Yaxshi', added_by: 'Vali', created_at: '2026-11-20T09:00:00.000Z', mine: false, votes: 2, voted: false }, { id: 2, title: 'Mening havolam', url: 'javascript:alert(1)', note: null, added_by: 'Sam Test', created_at: '2026-11-21T09:00:00.000Z', mine: true, votes: 0, voted: false }];
            if (method === 'GET') r = { body: { resources: res } };
            else if (method === 'POST' && /\/vote$/.test(p)) { const x = res.find((q) => '/teams/1/resources/' + q.id + '/vote' === p); x.voted = true; x.votes++; r = { body: { voted: true } }; }
            else if (method === 'POST') { res.push({ id: 3, title: body.title, url: body.url, note: body.note, added_by: 'Sam Test', created_at: '2026-11-22T09:00:00.000Z', mine: true, votes: 0, voted: false }); r = { status: 201, body: { id: 3 } }; }
            else r = { body: { message: 'Deleted' } };
        } else if (method === 'GET' && p === '/teams/interests') r = { body: { interests: state.interests || [] } };
        else if (method === 'PUT' && p === '/teams/interests') { state.interests = body.directions; r = { body: { interests: body.directions } }; }
        else if (method === 'GET' && p === '/teams/recommended') r = { body: { needs_interests: !(state.interests || []).length, teams: (state.interests || []).length ? state.teams.filter((t) => state.interests.includes(t.direction) && t.recruiting && !t.my_status) : [] } };
        else if (method === 'GET' && p === '/teams') r = { body: { teams: state.teams, directions: DIRS } };
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
        expect(pane(c, 'all').textContent).toContain("Hech narsa topilmadi");
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
        expect(html).toMatch(/var FEATURES = \{ teams: true, library: false, groups: false, courses: false \}/);
    });

    test('the demo form has the same fields', () => {
        const html = fs.readFileSync(path.join(root, 'secondary-pages/dashboard/pages/jamoalar.html'), 'utf8');
        ['tmCat', 'tmSphere', 'tmGoals'].forEach((id) => expect(html).toContain(`id="${id}"`));
    });

    test('the page script never writes user text through innerHTML', () => {
        expect(teamsSrc).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
    });
});

describe('finding teams', () => {
    test('closed team shows "Yopiq" and no join button; search, open-only filter and sort work', async () => {
        const state = makeState();
        state.teams[0].recruiting = false;
        state.teams.push({ ...base, id: 4, name: 'Dizayn Lab', direction: 'Dizayn', sphere: 'Figma', goals: 'UI', members: 9, rating: 30, rank: 1, activity: { writers: 4, messages: 10 } });
        const t = boot(state); await t.run('jamoalar'); await t.flush();
        const all = pane(t.c, 'all');
        const cardOf = (name) => [...all.querySelectorAll('article')].find((a) => a.textContent.includes(name));
        expect(cardOf('Python').textContent).toContain('Yopiq');
        expect(cardOf('Python').textContent).toContain("Hozir a'zo qabul qilinmaydi");
        expect(btn(cardOf('Python'), "So'rov yuborish")).toBeUndefined();
        expect(cardOf('Dizayn Lab').textContent).toContain('#1 reyting');
        expect(all.querySelector('article h3').textContent).toBe('Dizayn Lab');
        const search = all.querySelector('input[type=search]');
        search.value = 'figma'; search.dispatchEvent(new t.w.Event('input', { bubbles: true }));
        expect([...all.querySelectorAll('article h3')].map((h) => h.textContent)).toEqual(['Dizayn Lab']);
        search.value = ''; search.dispatchEvent(new t.w.Event('input', { bubbles: true }));
        const cb = all.querySelector('input[type=checkbox]'); cb.checked = true; cb.dispatchEvent(new t.w.Event('change', { bubbles: true }));
        expect([...all.querySelectorAll('article h3')].some((h) => h.textContent.includes('Python'))).toBe(false);
    });
    test('"Siz uchun" asks for interests, saves them and lists matching teams', async () => {
        const state = makeState();
        const t = boot(state); await t.run('jamoalar'); await t.flush();
        const fy = pane(t.c, 'foryou');
        expect(fy.textContent).toContain("kamida bitta yo'nalishni");
        click(fy.querySelector('[data-dir="Dasturlash"]')); await t.flush();
        expect(t.calls.some((c) => c.method === 'PUT' && c.path === '/teams/interests' && c.body.directions[0] === 'Dasturlash')).toBe(true);
        expect(fy.querySelector('[data-dir="Dasturlash"]').classList.contains('on')).toBe(true);
        expect(fy.textContent).toContain("Siz tanlagan yo'nalish: Dasturlash");
        click(fy.querySelector('[data-dir="Dasturlash"]')); await t.flush();
        expect(fy.textContent).toContain("kamida bitta yo'nalishni");
    });
    test('leaderboard lists ranked teams only, best first, with points', async () => {
        const state = makeState();
        state.teams[0].rank = 2; state.teams[0].rating = 15;
        state.teams[1].rank = 1; state.teams[1].rating = 40;
        const t = boot(state); await t.run('jamoalar'); await t.flush();
        const rows = [...pane(t.c, 'top').querySelectorAll('.pg-row')].map((r) => r.textContent);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toContain('#1 IELTS Birga'); expect(rows[0]).toContain('40 ball');
        expect(rows[1]).toContain('#2');
    });
});

describe('resources tab', () => {
    const member = () => { const state = makeState(); state.teams[1].my_status = 'active'; return state; };
    test('members see links as text, unsafe links get no href, own link cannot be voted', async () => {
        const state = member(); state.members = [];
        const t = boot(state); t.w.GEData.ctx.teamId = 2; await t.run('team-detail'); await t.flush();
        const rp = pane(t.c, 'resources');
        expect(rp.querySelector('a').textContent).toBe('<i>Python</i> darsi');
        expect(rp.querySelector('a i')).toBeNull();
        expect(rp.querySelector('a').getAttribute('href')).toBe('https://x.uz/p');
        expect([...rp.querySelectorAll('a')][1].hasAttribute('href')).toBe(false);
        const votes = [...rp.querySelectorAll('button')].filter((b) => b.textContent.startsWith('▲'));
        expect(votes[0].disabled).toBe(false); expect(votes[1].disabled).toBe(true);
    });
    test('voting and adding send the right requests; a bad link is stopped before sending', async () => {
        const state = member(); state.members = [];
        const t = boot(state); t.w.GEData.ctx.teamId = 2; await t.run('team-detail'); await t.flush();
        const rp = pane(t.c, 'resources');
        click([...rp.querySelectorAll('button')].find((b) => b.textContent === '▲ 2')); await t.flush();
        expect(t.calls.some((c) => c.method === 'POST' && c.path === '/teams/2/resources/1/vote')).toBe(true);
        setVal(t.c, 'trTitle', 'Yangi'); setVal(t.c, 'trUrl', 'ftp://x.uz');
        submit(rp.querySelector('form')); await t.flush();
        expect(rp.textContent).toContain('http:// yoki https://');
        expect(t.calls.some((c) => c.method === 'POST' && c.path === '/teams/2/resources')).toBe(false);
        setVal(t.c, 'trUrl', 'https://x.uz/yangi');
        submit(rp.querySelector('form')); await t.flush();
        expect(t.calls.find((c) => c.method === 'POST' && c.path === '/teams/2/resources').body).toMatchObject({ title: 'Yangi', url: 'https://x.uz/yangi' });
        expect(rp.textContent).toContain('Yangi');
    });
    test('visitors who are not members have no Resurslar tab', async () => {
        const t = boot(makeState()); t.w.GEData.ctx.teamId = 1; await t.run('team-detail'); await t.flush();
        expect(t.c.querySelector('[data-pane="resources"]')).toBeNull();
    });
});

describe('events tab', () => {
    const asMember = () => { const state = makeState(); state.teams[1].my_status = 'active'; state.members = []; return state; };
    test('a member sees the meetup as text and can say "Qatnashaman"; no planning form or delete', async () => {
        const t = boot(asMember()); t.w.GEData.ctx.teamId = 2; await t.run('team-detail'); await t.flush();
        const ep = pane(t.c, 'events');
        expect(ep.textContent).toContain('<b>Haftalik</b> uchrashuv');
        expect(ep.querySelector('b b')).toBeNull();
        expect(ep.textContent).toContain('1 kishi qatnashadi');
        expect(ep.querySelector('form')).toBeNull();
        expect(btn(ep, "O'chirish")).toBeUndefined();
        click(btn(ep, 'Qatnashaman')); await t.flush();
        expect(t.calls.some((c) => c.method === 'POST' && c.path === '/teams/2/events/1/going')).toBe(true);
        expect(ep.textContent).toContain('2 kishi qatnashadi');
    });
    test('the admin plans a meetup: past time is stopped, a good one is sent as UTC', async () => {
        const state = makeState(); state.members = [];
        const t = boot(state); t.w.GEData.ctx.teamId = 3; await t.run('team-detail'); await t.flush();
        const ep = pane(t.c, 'events');
        expect(btn(ep, "O'chirish")).toBeTruthy();
        setVal(t.c, 'teTitle', 'Yangi'); setVal(t.c, 'teWhen', '2020-01-01T10:00');
        submit(ep.querySelector('form')); await t.flush();
        expect(ep.textContent).toContain('kelajakda');
        expect(t.calls.some((c) => c.method === 'POST' && c.path === '/teams/3/events')).toBe(false);
        setVal(t.c, 'teWhen', '2099-01-01T10:00');
        submit(ep.querySelector('form')); await t.flush();
        const sent = t.calls.find((c) => c.method === 'POST' && c.path === '/teams/3/events').body;
        expect(sent.title).toBe('Yangi'); expect(sent.starts_at).toMatch(/^2099-01-01T.*Z$/);
    });
    test('visitors have no Tadbirlar tab', async () => {
        const t = boot(makeState()); t.w.GEData.ctx.teamId = 1; await t.run('team-detail'); await t.flush();
        expect(t.c.querySelector('[data-pane="events"]')).toBeNull();
    });
});

describe('team workspace layout', () => {
    test('a member gets tabs + chat in the main column and the facts in the side column', async () => {
        const state = makeState(); state.teams[1].my_status = 'active'; state.members = [];
        const t = boot(state); t.w.GEData.ctx.teamId = 2; await t.run('team-detail'); await t.flush();
        const grid = t.c.querySelector('.pg-team .tt-grid');
        expect(grid).not.toBeNull();
        const main = grid.querySelector('.tt-main'); const side = grid.querySelector('.tt-side');
        expect(main.querySelector('.pg-tabs')).not.toBeNull();
        expect(main.querySelector('[data-pane="chat"] .tc-compose')).not.toBeNull();
        expect(side.textContent).toContain('Ochilgan sana');
        expect(side.textContent).toContain('Jamoalarga qaytish');
        expect(side.querySelector('.tt-line').textContent).toContain("a'zo");
        expect(main.querySelector('.tt-facts')).toBeNull();
    });
    test('a visitor keeps the plain page: no workspace grid', async () => {
        const t = boot(makeState()); t.w.GEData.ctx.teamId = 1; await t.run('team-detail'); await t.flush();
        expect(t.c.querySelector('.tt-grid')).toBeNull();
        expect(t.c.textContent).toContain('Ochilgan sana');
    });
});

describe('battle rating', () => {
    test('the leaderboard and the team record show numbers and names as text only', async () => {
        const t = boot(makeState()); await t.run('musobaqalar'); await t.flush();
        const bp = pane(t.c, 'battle');
        expect(bp.textContent).toContain('Battle reytingi');
        expect(bp.textContent).toContain('<i>Alfa</i>'); expect(bp.querySelector('td i')).toBeNull();
        expect(bp.textContent).toContain('Oltin');
    });
    test('the team page has the record card: rating, league, badge, trophy', async () => {
        const state = makeState(); const t = boot(state); t.w.GEData.ctx.teamId = 1;
        await t.run('team-detail'); await t.flush();
        const rc = t.c.querySelector('[data-record]');
        expect(rc).not.toBeNull();
        expect(rc.textContent).toContain('1216 ball'); expect(rc.textContent).toContain('Oltin liga');
        expect(rc.textContent).toContain("Birinchi g'alaba"); expect(rc.textContent).toContain('<b>Kubok</b> battle');
        expect(rc.querySelector('b b')).toBeNull();
    });
    test('the record card shows the form, the streak and the last games as text', async () => {
        const t = boot(makeState()); t.w.GEData.ctx.teamId = 1;
        await t.run('team-detail'); await t.flush();
        const rc = t.c.querySelector('[data-record]');
        expect(rc.querySelector('[data-form]').textContent).toContain("G' D M");
        expect(rc.textContent).toContain("2 ta g'alaba ketma-ket");
        expect(rc.querySelector('[data-game="8"]').textContent).toBe("G'alaba · <i>Beta</i> · 5 : 3");
        expect(rc.querySelector('[data-game="7"]').textContent).toBe('Durang · Gamma · 4 : 4');
        expect(rc.querySelector('[data-game="6"]').textContent).toContain("Mag'lubiyat");
        expect(rc.querySelector('i')).toBeNull();
    });
    test('the team page shows this week\'s activity', async () => {
        const t = boot(makeState()); t.w.GEData.ctx.teamId = 1;
        await t.run('team-detail'); await t.flush();
        expect(t.c.textContent).toMatch(/Bu hafta\d+ faol, \d+ xabar/);
    });
});

describe('project battle', () => {
    const proj = { id: 8, title: 'Sayt', topic: 'Portfolio', kind: 'project', status: 'active', ends_at: new Date(Date.now() + 86400000).toISOString(), duration_days: 1, host_team_id: 3, my_team_id: 3, can_submit: true, is_host_admin: true, can_respond: false,
        teams: [{ team_id: 3, name: 'Host jamoa', state: 'host', submitted: true, submission: { link: 'https://github.com/a/b', note: 'eski' } }, { team_id: 1, name: 'Python Klub', state: 'accepted', submitted: false }] };
    test('the admin hands in a link and a note; the form shows what was handed in before', async () => {
        const state = makeState(); state.battles = [proj];
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const bp = pane(t.c, 'battle');
        expect(bp.textContent).toContain('Host jamoa · Chorlovchi · topshirdi');
        expect(bp.textContent).toContain('Python Klub · Qabul qildi · hali topshirmagan');
        const form = [...bp.querySelectorAll('form')].find((f) => f.textContent.includes('Loyihani topshirish'));
        const [link, nt] = [form.querySelector('input'), form.querySelector('textarea')];
        expect(link.value).toBe('https://github.com/a/b'); expect(nt.value).toBe('eski');
        link.value = 'https://github.com/a/yangi'; nt.value = 'yangi izoh';
        form.dispatchEvent(new t.w.Event('submit', { bubbles: true, cancelable: true })); await t.flush();
        expect(t.calls.find((c) => c.path === '/battles/8/submit').body).toEqual({ link: 'https://github.com/a/yangi', note: 'yangi izoh' });
    });
    test('a refused link shows a short Uzbek message', async () => {
        const state = makeState(); state.battles = [proj]; state.submitFails = true;
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const form = [...pane(t.c, 'battle').querySelectorAll('form')].find((f) => f.textContent.includes('Loyihani topshirish'));
        form.querySelector('input').value = 'http://x.uz';
        form.dispatchEvent(new t.w.Event('submit', { bubbles: true, cancelable: true })); await t.flush();
        expect(form.textContent).toContain('https:// bilan boshlanishi');
    });
    test('members who cannot hand in see no form; waiting for the judge and finished battles show status and safe links', async () => {
        const state = makeState();
        state.battles = [Object.assign({}, proj, { id: 9, can_submit: false, status: 'judging' }),
            Object.assign({}, proj, { id: 10, can_submit: false, status: 'finished', teams: [{ team_id: 3, name: 'Host jamoa', state: 'host', result: { score: 90, correct_total: 90, participants: 1, place: 1 }, submission: { link: 'https://github.com/a/b' } }, { team_id: 1, name: 'Python Klub', state: 'accepted', result: { score: 0, correct_total: 0, participants: 0, place: 2 }, submission: { link: 'javascript:alert(1)' } }] })];
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const bp = pane(t.c, 'battle');
        expect(bp.textContent).toContain('Hakam baholamoqda');
        expect(bp.textContent).not.toContain('Loyihani topshirish');
        const anchors = [...bp.querySelectorAll('a')];
        expect(anchors.map((a) => a.href)).toEqual(['https://github.com/a/b']);
        expect(bp.textContent).toContain('javascript:alert(1)');
    });
});

describe('battle quiz', () => {
    const live = { id: 5, title: 'Jonli', topic: 'T', kind: 'quiz', status: 'active', ends_at: new Date(Date.now() + 86400000).toISOString(), duration_days: 1, host_team_id: 3, my_team_id: 3, teams: [{ team_id: 3, name: 'Host jamoa', state: 'host' }, { team_id: 1, name: 'Python Klub', state: 'accepted' }], is_host_admin: false, can_respond: false };
    test('a player opens the quiz, answers once, and the answer is saved without grading; text is never HTML', async () => {
        const state = makeState(); state.battles = [live];
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const bp = pane(t.c, 'battle');
        click(btn(bp, 'Viktorinaga kirish')); await t.flush();
        expect(bp.textContent).toContain('<i>2+2</i> nechchi?');
        expect(bp.querySelector('i')).toBeNull();
        click(btn(bp, 'B. 4')); await t.flush();
        expect(t.calls.find((c) => c.path === '/battles/5/answer').body).toEqual({ question_id: 11, choice: 1 });
        expect(bp.textContent).toContain('(tanlandi)');
        expect(bp.textContent).not.toMatch(/to'g'ri|noto'g'ri|✓/);
        expect([...bp.querySelectorAll('button')].find((b) => b.textContent.startsWith('B. 4')).disabled).toBe(true);
    });
    test('a refused answer shows a short Uzbek message', async () => {
        const state = makeState(); state.battles = [live]; state.answerFails = true;
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const bp = pane(t.c, 'battle');
        click(btn(bp, 'Viktorinaga kirish')); await t.flush();
        click(btn(bp, 'A. 3')); await t.flush();
        expect(bp.textContent).toContain('allaqachon berilgan');
    });
    test('a finished battle shows the place table and the right answers', async () => {
        const state = makeState(); state.quizFinished = true;
        state.battles = [Object.assign({}, live, { status: 'finished', teams: [{ team_id: 3, name: 'Host jamoa', state: 'host', result: { score: 6.67, correct_total: 20, participants: 3, place: 1 } }, { team_id: 1, name: 'Python Klub', state: 'accepted', result: { score: 3.33, correct_total: 10, participants: 2, place: 2 } }] })];
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const bp = pane(t.c, 'battle');
        expect(bp.textContent).toContain('Tugagan');
        const rows = Array.from(bp.querySelectorAll('tr')).map((r) => r.textContent);
        expect(rows[1]).toContain('Host jamoa'); expect(rows[1]).toContain('6.67'); expect(rows[2]).toContain('Python Klub');
        click(btn(bp, "Javoblarni ko'rish")); await t.flush();
        expect(bp.textContent).toContain('Izoh: Ikki va ikki');
        expect(bp.textContent).toContain('✓ sizniki');
    });
    test('people not playing get no quiz button', async () => {
        const state = makeState(); state.battles = [Object.assign({}, live, { my_team_id: null })];
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        expect(Array.from(pane(t.c, 'battle').querySelectorAll('button')).some((b) => /Viktorinaga/.test(b.textContent))).toBe(false);
    });
});

describe('battles tab', () => {
    test('shows the invitation as text and answering sends accept', async () => {
        const t = boot(makeState()); await t.run('musobaqalar'); await t.flush();
        const bp = pane(t.c, 'battle');
        expect(bp.textContent).toContain('<b>Python</b> battle');
        expect(bp.querySelector('b b')).toBeNull();
        expect(bp.textContent).toContain('Javob kutilmoqda');
        click(btn(bp, 'Qabul qilish')); await t.flush();
        expect(t.calls.find((c) => c.path === '/battles/1/respond').body).toEqual({ accept: true });
        expect(bp.textContent).toContain('Qabul qildi');
    });
    test('only team admins get the challenge form; it needs a name, a topic and an opponent', async () => {
        const state = makeState();
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const bp = pane(t.c, 'battle');
        const admin = state.teams.some((x) => x.is_captain);
        expect(!!bp.querySelector('form')).toBe(admin);
        if (!admin) return;
        const form = bp.querySelector('form');
        submit(form); await t.flush();
        expect(bp.textContent).toContain('Nom va mavzuni');
        setVal(t.c, 'tbTitle', 'Bellashuv'); setVal(t.c, 'tbTopic', 'JS');
        submit(form); await t.flush();
        expect(bp.textContent).toContain('raqib jamoani tanlang');
        expect(t.calls.some((c) => c.method === 'POST' && c.path === '/battles')).toBe(false);
        const cb = form.querySelector('input[type=checkbox]'); cb.checked = true; cb.dispatchEvent(new t.w.Event('change', { bubbles: true }));
        submit(form); await t.flush();
        const sent = t.calls.find((c) => c.method === 'POST' && c.path === '/battles').body;
        expect(sent).toMatchObject({ title: 'Bellashuv', topic: 'JS', kind: 'quiz', duration_days: 2 });
        expect(sent.opponent_team_ids).toHaveLength(1);
    });
});


describe('competitions section', () => {
    test('has its own page with the battles tab and an honest "coming soon" for seasonal tournaments', async () => {
        const t = boot(makeState()); await t.run('musobaqalar'); await t.flush();
        expect(t.c.querySelector('h1').textContent).toBe('Musobaqalar');
        expect(pane(t.c, 'battle').textContent).toContain('Battlelarim');
        expect(pane(t.c, 'season').textContent).toContain('tez orada');
        expect(pane(t.c, 'season').hidden).toBe(true);
    });
    test('the teams page no longer carries a battles tab', async () => {
        const t = boot(makeState()); await t.run('jamoalar'); await t.flush();
        expect([...t.c.querySelectorAll('.pg-tabs button')].map((b) => b.textContent)).not.toContain('Battlelar');
        expect(pane(t.c, 'battle')).toBeFalsy();
    });
});

describe('competitions: the list of teams', () => {
    const btnOf = (c, id) => c.querySelector(`[data-team="${id}"] button`);
    test('lists every team as plain text with its rating, strongest first', async () => {
        const state = makeState(); state.teams[1].rating = 50; state.teams[0].rating = 10;
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const tp = pane(t.c, 'teams');
        expect(tp.hidden).toBe(true);
        expect(tp.querySelectorAll('[data-team]')).toHaveLength(3);
        expect(tp.textContent).toContain('<b>Python</b> Sprint'); expect(tp.querySelector('h3 b')).toBeNull();
        expect([...tp.querySelectorAll('[data-team] h3')][0].textContent).toBe('IELTS Birga');
    });
    test('choosing a team opens the battles tab with that team already picked as the opponent', async () => {
        const state = makeState();
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const tp = pane(t.c, 'teams'); const bp = pane(t.c, 'battle');
        btnOf(tp, 1).dispatchEvent(new t.w.Event('click', { bubbles: true })); await t.flush();
        expect(bp.hidden).toBe(false); expect(tp.hidden).toBe(true);
        const form = bp.querySelector('form');
        expect([...form.querySelectorAll('input[type=checkbox]')].filter((c) => c.checked).map((c) => c.value)).toEqual(['1']);
        setVal(t.c, 'tbTitle', 'Bellashuv'); setVal(t.c, 'tbTopic', 'JS');
        submit(form); await t.flush();
        expect(t.calls.find((c) => c.method === 'POST' && c.path === '/battles').body).toMatchObject({ host_team_id: 3, opponent_team_ids: [1], title: 'Bellashuv' });
    });
    test('your own team and teams with too few members cannot be chosen, and say why', async () => {
        const state = makeState(); state.teams[1].members = 2;
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const tp = pane(t.c, 'teams');
        expect(btnOf(tp, 3).disabled).toBe(true); expect(tp.querySelector('[data-team="3"]').textContent).toContain('sizning jamoangiz');
        expect(btnOf(tp, 2).disabled).toBe(true); expect(tp.querySelector('[data-team="2"]').textContent).toContain('kamida 3');
        expect(btnOf(tp, 1).disabled).toBe(false);
    });
    test('people who are not team admins see the list but cannot send a request', async () => {
        const state = makeState(); state.teams.forEach((x) => { x.is_captain = false; });
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const tp = pane(t.c, 'teams');
        expect(tp.textContent).toContain("jamoa admini bo'lishingiz kerak");
        expect([...tp.querySelectorAll('[data-team] button')].every((b) => b.disabled)).toBe(true);
    });
    test('search narrows the list by name', async () => {
        const t = boot(makeState()); await t.run('musobaqalar'); await t.flush();
        const tp = pane(t.c, 'teams'); const q = tp.querySelector('input[type=search]');
        q.value = 'ielts'; q.dispatchEvent(new t.w.Event('input', { bubbles: true }));
        expect(tp.querySelectorAll('[data-team]')).toHaveLength(1);
        q.value = 'zzz'; q.dispatchEvent(new t.w.Event('input', { bubbles: true }));
        expect(tp.textContent).toContain('Hech narsa topilmadi');
    });
});


describe('competitions: seasonal tournaments', () => {
    const OPEN = { id: 4, title: '<b>Kuz</b> kubogi', topic: 'Python', round_days: 2, status: 'open', teams: [{ team_id: 1, name: 'Python Klub', group_no: null, mine: false }], matches: [] };
    const mineTeams = [{ id: 3, name: 'Mening jamoam', members: 4 }];
    test('with no tournament the page explains the format honestly', async () => {
        const t = boot(makeState()); await t.run('musobaqalar'); await t.flush();
        expect(pane(t.c, 'season').textContent).toContain('tez orada');
        expect(pane(t.c, 'season').textContent).toContain('har kim har kim bilan');
    });
    test('an admin registers a team in an open tournament; titles are plain text', async () => {
        const state = makeState(); state.tournaments = { tournaments: [OPEN], my_admin_teams: mineTeams };
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const sp = pane(t.c, 'season');
        expect(sp.textContent).toContain("<b>Kuz</b> kubogi"); expect(sp.querySelector('h3 b')).toBeNull();
        expect(sp.textContent).toContain("Ro'yxatdan o'tish ochiq");
        const form = sp.querySelector('form');
        form.dispatchEvent(new t.w.Event('submit', { bubbles: true, cancelable: true })); await t.flush();
        const call = t.calls.find((c) => c.path === '/tournaments/4/register');
        expect(call.method).toBe('POST'); expect(call.body).toEqual({ team_id: 3 });
    });
    test('a refusal is shown in Uzbek; non-admins get no form', async () => {
        const state = makeState(); state.tournaments = { tournaments: [OPEN], my_admin_teams: mineTeams }; state.regFails = true;
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const sp = pane(t.c, 'season');
        sp.querySelector('form').dispatchEvent(new t.w.Event('submit', { bubbles: true, cancelable: true })); await t.flush();
        expect(sp.textContent).toContain('kamida 3 ta faol');
        const s2 = makeState(); s2.tournaments = { tournaments: [OPEN], my_admin_teams: [] };
        const t2 = boot(s2); await t2.run('musobaqalar'); await t2.flush();
        expect(pane(t2.c, 'season').querySelector('form')).toBeNull();
        expect(pane(t2.c, 'season').textContent).toContain("jamoa admini bo'lishingiz kerak");
    });
    test('your registered team can be withdrawn', async () => {
        const state = makeState(); state.tournaments = { tournaments: [Object.assign({}, OPEN, { teams: [{ team_id: 3, name: 'Mening jamoam', group_no: null, mine: true }] })], my_admin_teams: mineTeams };
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const out = [...pane(t.c, 'season').querySelectorAll('button')].find((b) => b.textContent === 'Chiqarish');
        out.dispatchEvent(new t.w.Event('click', { bubbles: true })); await t.flush();
        expect(t.calls.find((c) => c.path === '/tournaments/4/withdraw').body).toEqual({ team_id: 3 });
    });
    test('after the draw: group tables and the fixture list by round, scores only for finished matches, all as text', async () => {
        const state = makeState();
        const row = (rank, id, name, pts) => ({ rank, team_id: id, name, played: 1, won: pts === 3 ? 1 : 0, drawn: 0, lost: pts === 3 ? 0 : 1, points: pts, diff: pts === 3 ? 3.33 : -3.33 });
        state.tournaments = { my_admin_teams: [], tournaments: [{ id: 4, title: 'Kuz', topic: 'P', round_days: 2, status: 'groups', next_round: 2, round_ready: false, groups_finished: false,
            teams: [{ team_id: 1, name: 'Alfa', group_no: 1 }, { team_id: 2, name: '<i>Beta</i>', group_no: 1 }, { team_id: 3, name: 'Gamma', group_no: 2 }],
            groups: [{ group_no: 1, table: [row(1, 1, 'Alfa', 3), row(2, 2, '<i>Beta</i>', 0)] }, { group_no: 2, table: [row(1, 3, 'Gamma', 0)] }],
            matches: [{ id: 1, stage: 'group', group_no: 1, round_no: 1, team_a: 1, team_b: 2, name_a: 'Alfa', name_b: '<i>Beta</i>', battle_id: 9, state: 'finished', score_a: 3.33, score_b: 0 },
                { id: 2, stage: 'group', group_no: 1, round_no: 2, team_a: 1, team_b: 2, name_a: 'Alfa', name_b: '<i>Beta</i>', battle_id: 10, state: 'active', score_a: null, score_b: null },
                { id: 3, stage: 'group', group_no: 2, round_no: 3, team_a: 3, team_b: 3, name_a: 'Gamma', name_b: 'Gamma', battle_id: null, state: 'waiting', score_a: null, score_b: null }] }] };
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const sp = pane(t.c, 'season');
        expect(sp.textContent).toContain('Guruh bosqichi');
        const g1 = sp.querySelector('[data-group="1"]');
        expect(g1.textContent).toContain('A guruhi');
        expect(g1.textContent).toContain('1-tur: Alfa 3.33 : 0 <i>Beta</i>');
        expect(g1.textContent).toContain("2-tur: Alfa — <i>Beta</i> (o'ynalmoqda)");
        expect(g1.querySelector('i')).toBeNull();
        expect([...g1.querySelectorAll('tr')].map((r) => r.textContent)[1]).toContain('Alfa');
        expect(sp.querySelector('[data-group="2"]').textContent).toContain('3-tur: Gamma — Gamma');
        expect(sp.textContent).toContain('3.33');
        const go = [...sp.querySelectorAll('button')].find((b) => b.textContent.startsWith("O'ynash"));
        go.dispatchEvent(new t.w.Event('click', { bubbles: true }));
        expect(pane(t.c, 'battle').hidden).toBe(false);
    });

    test('playoffs: stage cards with winners, the champion on top, all as text', async () => {
        const state = makeState();
        const m = (id, stage, a, b, st, sa, sb, w) => ({ id, stage, group_no: null, round_no: 1, team_a: a, team_b: b, name_a: a === 1 ? '<i>Alfa</i>' : 'Beta', name_b: b === 2 ? 'Beta' : 'Gamma', battle_id: 20 + id, state: st, score_a: sa, score_b: sb, winner: w });
        state.tournaments = { my_admin_teams: [], tournaments: [{ id: 4, title: 'Kuz', topic: 'P', round_days: 2, status: 'finished', next_round: null, groups_finished: true, playoff_stage: 'final', stage_finished: true,
            champion: { team_id: 1, name: '<b>Alfa</b>' }, teams: [], groups: [],
            matches: [m(1, 'semi', 1, 2, 'finished', 5, 2, 1), m(2, 'semi', 3, 4, 'finished', 1, 3, 4), m(3, 'final', 1, 2, 'finished', 4, 4, 1)] }] };
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const sp = pane(t.c, 'season');
        expect(sp.querySelector('[data-champion="1"]').textContent).toContain('Chempion: <b>Alfa</b>');
        expect(sp.querySelector('[data-stage="semi"]').textContent).toContain('Yarim final');
        expect(sp.querySelector('[data-stage="semi"]').textContent).toContain('<i>Alfa</i> 5 : 2 Beta → <i>Alfa</i>');
        expect(sp.querySelector('[data-stage="final"]').textContent).toContain('Final');
        expect(sp.querySelector('b')).toBeNull(); expect(sp.querySelector('i')).toBeNull();
    });
    test('playoffs running: the page says how a draw is decided', async () => {
        const state = makeState();
        state.tournaments = { my_admin_teams: [], tournaments: [{ id: 4, title: 'Kuz', topic: 'P', round_days: 2, status: 'playoffs', next_round: null, groups_finished: true, playoff_stage: 'final', stage_finished: false, champion: null, teams: [], groups: [],
            matches: [{ id: 3, stage: 'final', group_no: null, round_no: 3, team_a: 1, team_b: 2, name_a: 'Alfa', name_b: 'Beta', battle_id: 9, state: 'active', score_a: null, score_b: null, winner: null }] }] };
        const t = boot(state); await t.run('musobaqalar'); await t.flush();
        const sp = pane(t.c, 'season');
        expect(sp.textContent).toContain('Pley-off');
        expect(sp.textContent).toContain("Alfa — Beta (o'ynalmoqda)");
        expect(sp.textContent).toContain('Durang');
    });

});
