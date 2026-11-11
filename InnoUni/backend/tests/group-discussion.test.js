process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

let s;
const norm = (q) => q.replace(/\s+/g, ' ').trim();
const as = (userId, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const reset = () => { s = { members: [{ g: 1, u: 2, role: 'leader' }, { g: 1, u: 5, role: 'member' }], posts: [], next: 1, lastLimit: null }; };

const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?')) return [s.members.filter((m) => m.g === p[0] && m.u === p[1]).map((m) => ({ role: m.role }))];
        if (q.startsWith('INSERT INTO group_posts')) { const id = s.next++; s.posts.push({ id, group_id: p[0], user_id: p[1], kind: p[2], body: p[3] }); return [{ insertId: id }]; }
        if (q.startsWith('SELECT user_id FROM group_posts WHERE id = ?')) return [s.posts.filter((x) => x.id === p[0] && x.group_id === p[1]).map((x) => ({ user_id: x.user_id }))];
        if (q.startsWith('DELETE FROM group_posts')) { s.posts = s.posts.filter((x) => x.id !== p[0]); return [{}]; }
        if (q.includes('FROM group_posts p JOIN users u')) {
            const before = q.includes('p.id < ?') ? p[1] : Infinity;
            const rows = s.posts.filter((x) => x.group_id === p[0] && x.id < before).sort((a, b) => b.id - a.id).slice(0, Number(q.match(/LIMIT (\d+)/)[1])).map((x) => ({ ...x, full_name: 'N', created_at: 'now' }));
            return [rows];
        }
        if (q.startsWith('SELECT id, name, description, course_id FROM `groups`')) return [[{ id: 1, name: 'Py', description: null, course_id: 7 }]];
        if (q.includes('FROM group_members gm JOIN users u')) return [[{ id: 2, full_name: 'T', role: 'leader' }]];
        if (q.includes('FROM group_members gm JOIN `groups` g ON g.id = gm.group_id WHERE gm.user_id = ?')) return [[{ id: 1, name: 'Py', description: null, course_id: 7, role: 'member', members: '2' }]];
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(fakeDb));
beforeEach(reset);

const post = (u, body, id = 1) => request(app).post(`/api/groups/${id}/posts`).set(u).send(body);

test('login is required, and non-members are blocked everywhere', async () => {
    expect((await request(app).get('/api/groups/1/posts')).status).toBe(401);
    expect((await request(app).get('/api/groups/1/posts').set(as(99))).status).toBe(403);
    expect((await post(as(99), { body: 'hi' })).status).toBe(403);
    expect((await request(app).get('/api/groups/1').set(as(99))).status).toBe(403);
    expect((await request(app).get('/api/groups/abc/posts').set(as(5))).status).toBe(400);
});

test('members (student and teacher) can post and read', async () => {
    expect((await post(as(5), { body: ' Salom ' })).status).toBe(201);
    expect((await post(as(2, 'teacher'), { body: 'Mavzu', kind: 'topic' })).status).toBe(201);
    const res = await request(app).get('/api/groups/1/posts').set(as(5));
    expect(res.status).toBe(200);
    expect(res.body.posts.map((x) => x.body)).toEqual(['Mavzu', 'Salom']);
    expect(res.body.more).toBe(false);
});

test('validation: empty, too long, bad kind; topics are leader-only', async () => {
    expect((await post(as(5), { body: '   ' })).status).toBe(400);
    expect((await post(as(5), { body: 'x'.repeat(2001) })).status).toBe(400);
    expect((await post(as(5), { body: 'x', kind: 'evil' })).status).toBe(400);
    expect((await post(as(5), { body: 'x', kind: 'topic' })).status).toBe(403);
    expect(s.posts).toHaveLength(0);
});

test('paging: limit is page+1 and before is respected', async () => {
    for (let i = 0; i < 52; i++) await post(as(5), { body: 'm' + i });
    const a = await request(app).get('/api/groups/1/posts').set(as(5));
    expect(a.body.posts).toHaveLength(50);
    expect(a.body.more).toBe(true);
    const b = await request(app).get('/api/groups/1/posts?before=' + a.body.posts[49].id).set(as(5));
    expect(b.body.posts).toHaveLength(2);
    expect(b.body.more).toBe(false);
    expect((await request(app).get('/api/groups/1/posts?before=zz').set(as(5))).status).toBe(400);
});

test('delete: author or leader only', async () => {
    await post(as(5), { body: 'a' });                                  // id 1 by student 5
    s.members.push({ g: 1, u: 6, role: 'member' });
    expect((await request(app).delete('/api/groups/1/posts/1').set(as(6))).status).toBe(403);
    expect((await request(app).delete('/api/groups/1/posts/1').set(as(2, 'teacher'))).status).toBe(200);   // leader
    await post(as(5), { body: 'b' });
    expect((await request(app).delete('/api/groups/1/posts/2').set(as(5))).status).toBe(200);              // author
    expect((await request(app).delete('/api/groups/1/posts/77').set(as(5))).status).toBe(404);
});

test('group info and my groups work for any role', async () => {
    const r = await request(app).get('/api/groups/1').set(as(5));
    expect(r.body).toMatchObject({ group: { id: 1, courseId: 7 }, role: 'member' });
    const l = await request(app).get('/api/groups').set(as(2, 'teacher'));
    expect(l.body.groups[0]).toMatchObject({ id: 1, members: 2 });
});
