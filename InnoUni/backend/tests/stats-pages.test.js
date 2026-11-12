const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const dataSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-data.js'), 'utf8');
const pageSrc = fs.readFileSync(path.join(root, 'frontend/js/dashboard-stats.js'), 'utf8');

const teacherSum = {
    activeCourses: 2, draftCourses: 1, students: 4, tasksGiven: 6, toGrade: 3, gradedCount: 5, avgGrade: 77.5, ordersPending: 2,
    courses: [{ id: 1, title: '<b>JS</b>', status: 'active', students: 4, tasks: 6, submitted: 8, avgGrade: 77.5 }],
    week: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ day: '2026-11-0' + (i + 1), count: i })),
    recent: [{ type: 'submission', who: 'Ali Valiyev', what: 'Vazifa 1', at: new Date().toISOString() }],
};
const studentSum = {
    activeCourses: 1, completedCourses: 1, groups: 2, avgGrade: 90,
    tasks: { todo: 1, overdue: 0, dueSoon: 1, submitted: 1, graded: 2 },
    courses: [{ id: 1, title: 'JS', progress: 100, completed: true, teacher: 'Teacher T' }],
    recentGrades: [{ task: 'T1', course: 'JS', grade: 90, gradedAt: new Date().toISOString() }],
};
const students = { students: [{ id: 5, name: 'Ali Valiyev', courseId: 1, course: 'JS', progress: 40, lastActive: new Date().toISOString(), avgGrade: 88 }] };

function boot(role) {
    const dom = new JSDOM('<!doctype html><body><div id="mainOverview"><div class="stat-card"><div class="stat-value">24</div><div class="stat-label">x</div><div class="stat-change">12%</div></div><div class="stat-card"><div class="stat-value">156</div><div class="stat-label">x</div></div><div class="stat-card"><div class="stat-value">89</div><div class="stat-label">x</div></div><div class="stat-card"><div class="stat-value">4.8</div><div class="stat-label">x</div></div></div><div id="c"></div></body>', { runScripts: 'outside-only', url: 'https://site.test/' });
    const w = dom.window;
    w.config = { apiBaseUrl: 'https://api.test/api' };
    w.localStorage.setItem('user', JSON.stringify({ email: 'a@b.uz' }));
    w.fetch = jest.fn(async (url) => ({
        ok: true, status: 200,
        json: async () => (url.includes('/teacher/students') ? students : url.includes('/summary/teacher') ? teacherSum : studentSum),
    }));
    w.eval(dataSrc); w.eval(pageSrc);
    const session = { id: 1, token: 't', name: 'Sam Test', role };
    const c = w.document.getElementById('c');
    return { w, c, run: (page) => w.GEData.hydrate(page, c, session, () => {}, (e) => { throw e; }) };
}

test('teacher home fills the stat cards with real numbers and escapes titles', async () => {
    const { w, c, run } = boot('teacher');
    await run('t-home');
    expect([...w.document.querySelectorAll('#mainOverview .stat-value')].map((n) => n.textContent)).toEqual(['2', '4', '5', '77.5']);
    expect(w.document.querySelector('.stat-change').style.display).toBe('none');
    expect(c.querySelector('b b, .pg-lesson b').textContent).toBe('<b>JS</b>');
    expect(c.querySelectorAll('.pg-col').length).toBe(7);
    expect(c.textContent).toMatch(/3 ta javob baholashni kutmoqda/);
    expect(c.textContent).not.toMatch(/156|18\.5/);
});

test('teacher students list uses the real rows and keeps the search hook', async () => {
    const { c, run } = boot('teacher');
    await run('t-students');
    expect(c.querySelector('#studentRows tr').textContent).toContain('Ali Valiyev');
    expect(c.querySelector('[data-search="studentRows"]')).not.toBeNull();
    expect(c.textContent).toContain('Jami 1 o\'quvchi');
});

test('teacher statistics shows no revenue', async () => {
    const { c, run } = boot('teacher');
    await run('t-analytics');
    expect(c.textContent).toMatch(/To'lov tizimi ulangach/);
    expect(c.textContent).not.toMatch(/mln/);
});

test('student results: real grade, certificate only for a finished course', async () => {
    const { c, run } = boot('student');
    await run('results');
    expect(c.textContent).toContain('90');
    expect(c.querySelector('.pg-cert .name').textContent).toBe('Sam Test');
    expect(c.textContent).not.toMatch(/GE-2026|87\.4|Sunnat/);
});

test('student results without finished courses has no certificate', async () => {
    const { w, c, run } = boot('student');
    const f = w.fetch; w.fetch = jest.fn(async (u, o) => { const r = await f(u, o); const d = await r.json(); return { ok: true, json: async () => ({ ...d, completedCourses: 0, courses: [{ id: 1, title: 'JS', progress: 30, completed: false }] }) }; });
    await run('results');
    expect(c.querySelector('.pg-cert')).toBeNull();
});

test('profile shows the real name and email, no invented data', async () => {
    const { c, run } = boot('student');
    await run('profile');
    expect(c.textContent).toContain('Sam Test');
    expect(c.textContent).toContain('a@b.uz');
    expect(c.querySelectorAll('.pg-lesson').length).toBeGreaterThan(0);
});

function profileBoot(role, putResult) {
    const b = boot(role);
    const base = b.w.fetch;
    b.w.document.body.insertAdjacentHTML('beforeend', '<div id="userName">Sam Test</div>');
    b.w.fetch = jest.fn(async (url, opts) => {
        if (opts && opts.method === 'PUT') return putResult(url, opts);
        if (url.includes('/auth/profile')) return { ok: true, status: 200, json: async () => ({ user: { full_name: 'Sam Test', email: 'a@b.uz', phone: '+998901112233', bio: 'Bio matni' } }) };
        return base(url, opts);
    });
    return b;
}
const submit = (w, form) => form.dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
const tick = () => new Promise((r) => setTimeout(r, 10));

test('profile form is filled with the saved data', async () => {
    const { c, run } = profileBoot('student', async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await run('profile');
    expect(c.querySelector('#pfName').value).toBe('Sam Test');
    expect(c.querySelector('#pfPhone').value).toBe('+998901112233');
    expect(c.textContent).toContain('Bio matni');
});

test('saving the profile sends the data and updates the header and storage', async () => {
    const { w, c, run } = profileBoot('teacher', async () => ({ ok: true, status: 200, json: async () => ({ user: { full_name: 'Yangi Ism', email: 'new@b.uz', phone: null, bio: 'Yangi bio' } }) }));
    await run('profile');
    c.querySelector('#pfName').value = 'Yangi Ism'; c.querySelector('#pfEmail').value = 'new@b.uz';
    submit(w, c.querySelector('#pfName').form); await tick();
    const call = w.fetch.mock.calls.find(([, o]) => o && o.method === 'PUT');
    expect(call[0]).toContain('/auth/profile');
    expect(JSON.parse(call[1].body)).toMatchObject({ full_name: 'Yangi Ism', email: 'new@b.uz' });
    expect(w.document.getElementById('userName').textContent).toBe('Yangi Ism');
    expect(JSON.parse(w.localStorage.getItem('user')).email).toBe('new@b.uz');
    expect(c.querySelector('h2').textContent).toBe('Yangi Ism');
});

test('profile form validates before sending and explains a taken email', async () => {
    const { w, c, run } = profileBoot('student', async () => ({ ok: false, status: 400, json: async () => ({ error: 'Email is already taken' }) }));
    await run('profile');
    c.querySelector('#pfEmail').value = 'bad';
    submit(w, c.querySelector('#pfName').form); await tick();
    expect(c.textContent).toContain('Email noto');
    expect(w.fetch.mock.calls.some(([, o]) => o && o.method === 'PUT')).toBe(false);
    c.querySelector('#pfEmail').value = 'x@y.uz';
    submit(w, c.querySelector('#pfName').form); await tick();
    expect(c.textContent).toContain('Bu email band');
});

test('password form checks the match, then sends and clears the fields', async () => {
    const { w, c, run } = profileBoot('student', async () => ({ ok: true, status: 200, json: async () => ({ message: 'ok' }) }));
    await run('profile');
    const form = c.querySelector('#pfOld').form;
    c.querySelector('#pfOld').value = 'oldpass123'; c.querySelector('#pfNew').value = 'newpass123'; c.querySelector('#pfNew2').value = 'different1';
    submit(w, form); await tick();
    expect(c.textContent).toContain('bir xil emas');
    expect(w.fetch.mock.calls.some(([, o]) => o && o.method === 'PUT')).toBe(false);
    c.querySelector('#pfNew2').value = 'newpass123';
    submit(w, form); await tick();
    const call = w.fetch.mock.calls.find(([, o]) => o && o.method === 'PUT');
    expect(JSON.parse(call[1].body)).toEqual({ current_password: 'oldpass123', new_password: 'newpass123' });
    expect(c.querySelector('#pfOld').value).toBe('');
});

test('a wrong current password (401) shows a message instead of crashing', async () => {
    const { w, c, run } = profileBoot('student', async () => ({ ok: false, status: 401, json: async () => ({ error: 'Current password is incorrect' }) }));
    await run('profile');
    c.querySelector('#pfOld').value = 'wrongpass1'; c.querySelector('#pfNew').value = 'newpass123'; c.querySelector('#pfNew2').value = 'newpass123';
    submit(w, c.querySelector('#pfOld').form); await tick();
    expect(c.textContent).toContain('Joriy parol noto');
});
