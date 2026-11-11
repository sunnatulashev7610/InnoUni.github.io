process.env.JWT_SECRET = 'test-secret-test-secret-123';
delete process.env.FEATURE_TEAMS;
delete process.env.FEATURE_LIBRARY;
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

const as = (userId, role) => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
beforeAll(() => app.setDb({ execute: async () => [[]], query: async () => [[]] }));
afterEach(() => { delete process.env.FEATURE_TEAMS; delete process.env.FEATURE_LIBRARY; });

test('teams are closed by default, for every role and method', async () => {
    for (const role of ['student', 'teacher', 'admin']) {
        const get = await request(app).get('/api/teams').set(as(1, role));
        expect(get.status).toBe(404);
        const post = await request(app).post('/api/teams').set(as(1, role)).send({ name: 'x' });
        expect(post.status).toBe(404);
    }
});

test('library is closed by default', async () => {
    const res = await request(app).get('/api/teacher/library/1').set(as(1, 'teacher'));
    expect(res.status).toBe(404);
});

test('flags switch the features back on', async () => {
    process.env.FEATURE_LIBRARY = 'true';
    expect((await request(app).get('/api/teacher/library/1').set(as(1, 'teacher'))).status).toBe(200);
    process.env.FEATURE_TEAMS = 'true';
    expect((await request(app).get('/api/teams').set(as(1, 'student'))).status).not.toBe(404);
});

test('dashboard hides the Teams and Library menu items and guards their pages', () => {
    const html = require('fs').readFileSync(require('path').join(__dirname, '../../secondary-pages/dashboard/dashboard.html'), 'utf8');
    expect(html).toMatch(/var FEATURES = \{ teams: false, library: false \}/);
    expect(html).toMatch(/data-feature="teams" hidden onclick="loadPage\('jamoalar'/);
    expect(html).toMatch(/data-feature="library" hidden onclick="loadPage\('library'/);
    expect(html).toMatch(/PAGE_FEATURE\[page\] && !FEATURES\[PAGE_FEATURE\[page\]\]/);
});

test('no visible page links to the closed features', () => {
    const fs = require('fs'); const path = require('path');
    const dir = path.join(__dirname, '../../secondary-pages/dashboard/pages');
    const closed = ['jamoalar.html', 'library.html', 'team-detail.html'];
    fs.readdirSync(dir).filter((f) => !closed.includes(f)).forEach((f) => {
        expect([f, /data-open="(jamoalar|library|team-detail)"/.test(fs.readFileSync(path.join(dir, f), 'utf8'))]).toEqual([f, false]);
    });
});
