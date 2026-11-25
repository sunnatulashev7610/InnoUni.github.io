// Study groups and the public course catalog are closed for now (the focus is teams and competitions)
process.env.JWT_SECRET = 'test-secret-test-secret-123';
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { register, withAccounts } = require('./helpers/accounts');
const { isEnabled } = require('../utils/features');

const page = (f) => fs.readFileSync(path.join(__dirname, '../../secondary-pages', f), 'utf8');
const as = (userId, role) => (register(userId, role), { Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });

describe('server', () => {
    beforeAll(() => { app.setDb(withAccounts({ execute: async () => [[]], query: async () => [[]] })); });
    afterEach(() => { process.env.FEATURE_GROUPS = 'true'; });
    test('the groups API answers "not available yet" while the switch is off', async () => {
        process.env.FEATURE_GROUPS = 'false';
        const r = await request(app).get('/api/groups').set(as(8, 'student'));
        expect(r.status).toBe(404); expect(r.body.error).toMatch(/not available yet/);
    });
    test('and works when FEATURE_GROUPS=true', async () => {
        process.env.FEATURE_GROUPS = 'true';
        expect((await request(app).get('/api/groups').set(as(8, 'student'))).status).toBe(200);
    });
    test('the default (no variable) is closed', () => {
        delete process.env.FEATURE_GROUPS;
        expect(isEnabled('groups')).toBe(false);
    });
});

describe('dashboard page', () => {
    const html = page('dashboard/dashboard.html');
    test('the groups and courses menu items are switched by the feature list, and the list has them off', () => {
        expect(html).toMatch(/var FEATURES = \{[^}]*groups: false[^}]*courses: false/);
        const items = html.match(/<button class="nav-item"[^>]*loadPage\('(groups|courses)'[^>]*>/g);
        expect(items).toHaveLength(3);                                   // student groups, student courses, teacher groups
        items.forEach((i) => { expect(i).toContain('hidden'); expect(i).toMatch(/data-feature="(groups|courses)"/); });
    });
    test('the pages themselves are closed too, but a course (also an AI course) and its lessons still open', () => {
        const m = html.match(/var PAGE_FEATURE = \{([^}]*)\}/)[1];
        expect(m).toMatch(/groups: 'groups'/); expect(m).toMatch(/'group-detail': 'groups'/); expect(m).toMatch(/courses: 'courses'/);
        expect(m).not.toMatch(/'course-detail'/); expect(m).not.toMatch(/'ai-lesson'/);
    });
    test('the closed course catalog sends a student to the AI courses tab', () => {
        expect(html).toMatch(/page === 'courses' && window\.GEData && currentRole !== 'teacher'\) \{ window\.GEData\.ctx\.aiTab = 'ai-courses'; page = 'ai-hub'/);
    });
});
