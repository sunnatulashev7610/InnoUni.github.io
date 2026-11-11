process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { keywords } = require('../utils/orderSuggestions');

const STUDENT = 5; const OTHER = 6; const T1 = 2; const T2 = 3; const ADMIN = 1;
let s;
const norm = (q) => q.replace(/\s+/g, ' ').trim();
const as = (userId, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId, email: 'x@x.uz', role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
// course 10 belongs to teacher T1, course 11 to T2
const teacherOf = { 10: T1, 11: T2 };
const reset = () => { s = { orders: [], next: 1, sugg: { courses: [], mats: [] }, log: [] }; };

const fakeDb = {
    async execute(raw, p = []) {
        const q = norm(raw);
        if (q.startsWith('SELECT id FROM courses WHERE id = ?')) return [p[0] in teacherOf ? [{ id: p[0] }] : []];
        if (q.startsWith('SELECT COUNT(*) AS n FROM orders')) return [[{ n: String(s.orders.filter((o) => o.user_id === p[0] && ['pending', 'offered'].includes(o.status)).length) }]];
        if (q.startsWith('INSERT INTO orders')) { const o = { id: s.next++, user_id: p[0], kind: p[1], item_title: p[2], note: p[3], course_id: p[4], status: 'pending', price: null, reply: null, handled_by: null, created_at: 'now' }; s.orders.push(o); return [{ insertId: o.id }]; }
        if (q.startsWith('SELECT id, kind, item_title, note, status, price, reply, course_id, created_at FROM orders WHERE user_id = ?')) return [s.orders.filter((o) => o.user_id === p[0]).map((o) => ({ ...o, price: o.price === null ? null : String(o.price) }))];
        if (q.startsWith("UPDATE orders SET status = 'confirmed' WHERE id = ? AND user_id = ?")) { const o = s.orders.find((x) => x.id === p[0] && x.user_id === p[1] && x.status === 'offered'); if (o) o.status = 'confirmed'; return [{ affectedRows: o ? 1 : 0 }]; }
        if (q.startsWith("UPDATE orders SET status = 'cancelled'")) { const o = s.orders.find((x) => x.id === p[0] && x.user_id === p[1] && ['pending', 'offered'].includes(x.status)); if (o) o.status = 'cancelled'; return [{ affectedRows: o ? 1 : 0 }]; }
        if (q.startsWith("UPDATE orders SET status = 'offered'")) {
            const [price, reply, by, id, teacher] = p;
            const o = s.orders.find((x) => x.id === id && x.status === 'pending' && ['course', 'material'].includes(x.kind) && (x.course_id === null || teacherOf[x.course_id] === teacher));
            if (o) Object.assign(o, { status: 'offered', price, reply, handled_by: by });
            return [{ affectedRows: o ? 1 : 0 }];
        }
        if (q.startsWith("UPDATE orders SET status = 'rejected'")) {
            const [reply, by, id, teacher] = p;
            const o = s.orders.find((x) => x.id === id && x.status === 'pending' && ['course', 'material'].includes(x.kind) && (x.course_id === null || teacherOf[x.course_id] === teacher));
            if (o) Object.assign(o, { status: 'rejected', reply, handled_by: by });
            return [{ affectedRows: o ? 1 : 0 }];
        }
        if (q.startsWith('SELECT o.id, o.kind, o.item_title, o.note, o.status, o.price')) {
            const t = p[0];
            return [s.orders.filter((o) => ['course', 'material'].includes(o.kind) && ((o.status === 'pending' && (o.course_id === null || teacherOf[o.course_id] === t)) || o.handled_by === t))
                .map((o) => ({ ...o, student: 'Ali', course_title: null }))];
        }
        if (q.startsWith("UPDATE orders SET status = ?, reply = ?, handled_by = ? WHERE id = ? AND kind = 'tariff'")) {
            const o = s.orders.find((x) => x.id === p[3] && x.kind === 'tariff' && x.status === 'pending');
            if (o) Object.assign(o, { status: p[0], reply: p[1], handled_by: p[2] });
            return [{ affectedRows: o ? 1 : 0 }];
        }
        if (q.startsWith('INSERT INTO admin_log')) { s.log.push(p); return [{}]; }
        if (q.includes('FROM courses c LEFT JOIN users u')) return [s.sugg.courses];
        if (q.includes('FROM course_content cc JOIN courses c')) return [s.sugg.mats];
        throw new Error('Unexpected query: ' + q);
    },
    query: async () => [[]]
};
beforeAll(() => app.setDb(fakeDb));
beforeEach(reset);

const place = (body, who = as(STUDENT)) => request(app).post('/api/orders').set(who).send(body);
const post = (url, who, body = {}) => request(app).post(url).set(who).send(body);

describe('placing orders', () => {
    test('a request starts as pending and goes to teachers; a client price is ignored', async () => {
        const r = await place({ kind: 'material', item_title: 'Python darsligi', note: 'PDF bo\'lsa yaxshi', amount: 1, price: 1 });
        expect(r.status).toBe(201);
        expect(r.body).toMatchObject({ status: 'pending', sentTo: 'teacher' });
        expect(s.orders[0].price).toBeNull();
    });
    test('tariff goes to the admin; teachers may order a tariff but not a course', async () => {
        expect((await place({ kind: 'tariff', item_title: 'Standart tarif' })).body.sentTo).toBe('admin');
        expect((await place({ kind: 'tariff', item_title: 'Markaz' }, as(T1, 'teacher'))).status).toBe(201);
        expect((await place({ kind: 'course', item_title: 'x' }, as(T1, 'teacher'))).status).toBe(403);
        expect((await place({ kind: 'tariff', item_title: 'x' }, as(ADMIN, 'admin'))).status).toBe(403);
    });
    test('validation and course check', async () => {
        expect((await place({ kind: 'car', item_title: 'x' })).status).toBe(400);
        expect((await place({ kind: 'course', item_title: ' ' })).status).toBe(400);
        expect((await place({ kind: 'course', item_title: 'x', course_id: 'a' })).status).toBe(400);
        expect((await place({ kind: 'course', item_title: 'x', course_id: 99 })).status).toBe(404);
        expect((await place({ kind: 'tariff', item_title: 'x', course_id: 10 })).status).toBe(400);
        expect(s.orders).toHaveLength(0);
    });
    test('too many open orders are refused', async () => {
        for (let i = 0; i < 20; i++) await place({ kind: 'course', item_title: 'n' + i });
        expect((await place({ kind: 'course', item_title: 'one more' })).status).toBe(429);
    });
});

describe('the student never sees a price until a teacher sets it', () => {
    test('mine: price hidden while pending, shown when offered or confirmed, only to the owner', async () => {
        const { body } = await place({ kind: 'course', item_title: 'React' });
        let mine = (await request(app).get('/api/orders/mine').set(as(STUDENT))).body.orders[0];
        expect(mine).toMatchObject({ status: 'pending', price: null });
        expect(mine).not.toHaveProperty('amount');
        await post(`/api/orders/${body.id}/offer`, as(T1, 'teacher'), { price: 120000, reply: 'Videolar bilan' });
        mine = (await request(app).get('/api/orders/mine').set(as(STUDENT))).body.orders[0];
        expect(mine).toMatchObject({ status: 'offered', price: 120000, reply: 'Videolar bilan' });
        await post(`/api/orders/${body.id}/accept`, as(STUDENT));
        expect((await request(app).get('/api/orders/mine').set(as(STUDENT))).body.orders[0]).toMatchObject({ status: 'confirmed', price: 120000 });
        expect((await request(app).get('/api/orders/mine').set(as(OTHER))).body.orders).toHaveLength(0);
    });
});

describe('teacher side', () => {
    test('a request tied to a course reaches only that course\'s teacher; a free-text request reaches all teachers', async () => {
        await place({ kind: 'course', item_title: 'for T1', course_id: 10 });
        await place({ kind: 'material', item_title: 'for anyone' });
        const t1 = (await request(app).get('/api/orders/incoming').set(as(T1, 'teacher'))).body.orders.map((o) => o.item_title);
        const t2 = (await request(app).get('/api/orders/incoming').set(as(T2, 'teacher'))).body.orders.map((o) => o.item_title);
        expect(t1.sort()).toEqual(['for T1', 'for anyone']);
        expect(t2).toEqual(['for anyone']);
        await place({ kind: 'tariff', item_title: 'tariff' });
        expect((await request(app).get('/api/orders/incoming').set(as(T1, 'teacher'))).body.orders.some((o) => o.item_title === 'tariff')).toBe(false);
    });
    test('free offer sets price 0; invalid prices are refused; the other teacher cannot answer a course-bound request', async () => {
        const { body } = await place({ kind: 'course', item_title: 'x', course_id: 10 });
        const t2 = as(T2, 'teacher'); const t1 = as(T1, 'teacher');
        expect((await post(`/api/orders/${body.id}/offer`, t2, { price: 1000 })).status).toBe(404);
        for (const bad of [{}, { price: -1 }, { price: 1.5 }, { price: '100' }, { price: 100000001 }]) {
            expect((await post(`/api/orders/${body.id}/offer`, t1, bad)).status).toBe(400);
        }
        expect((await post(`/api/orders/${body.id}/offer`, t1, { free: true })).body).toMatchObject({ status: 'offered', price: 0 });
    });
    test('first answer wins; reject keeps the reply; the answered order stays with that teacher', async () => {
        const { body } = await place({ kind: 'material', item_title: 'x' });
        expect((await post(`/api/orders/${body.id}/reject`, as(T1, 'teacher'), { reply: 'Hozircha yo\'q' })).status).toBe(200);
        expect((await post(`/api/orders/${body.id}/offer`, as(T2, 'teacher'), { price: 5 })).status).toBe(404);
        expect((await request(app).get('/api/orders/incoming').set(as(T1, 'teacher'))).body.orders[0]).toMatchObject({ status: 'rejected', reply: 'Hozircha yo\'q' });
        expect((await request(app).get('/api/orders/incoming').set(as(T2, 'teacher'))).body.orders).toHaveLength(0);
    });
    test('students cannot answer, tariffs cannot be answered by teachers', async () => {
        const { body } = await place({ kind: 'course', item_title: 'x' });
        expect((await post(`/api/orders/${body.id}/offer`, as(STUDENT), { price: 1 })).status).toBe(403);
        const t = await place({ kind: 'tariff', item_title: 'plan' });
        expect((await post(`/api/orders/${t.body.id}/offer`, as(T1, 'teacher'), { price: 1 })).status).toBe(404);
        expect((await post(`/api/orders/${t.body.id}/reject`, as(T1, 'teacher'))).status).toBe(404);
    });
});

describe('student actions', () => {
    test('accept only after an offer; cancel only while open; not other people\'s orders', async () => {
        const { body } = await place({ kind: 'course', item_title: 'x' });
        expect((await post(`/api/orders/${body.id}/accept`, as(STUDENT))).status).toBe(404);   // nothing offered yet
        await post(`/api/orders/${body.id}/offer`, as(T1, 'teacher'), { free: true });
        expect((await post(`/api/orders/${body.id}/accept`, as(OTHER))).status).toBe(404);
        expect((await post(`/api/orders/${body.id}/cancel`, as(OTHER))).status).toBe(404);
        expect((await post(`/api/orders/${body.id}/cancel`, as(STUDENT))).status).toBe(200);
        expect((await post(`/api/orders/${body.id}/accept`, as(STUDENT))).status).toBe(404);
        expect((await post('/api/orders/abc/cancel', as(STUDENT))).status).toBe(400);
    });
});

describe('admin and tariffs', () => {
    test('only the admin decides tariff orders, once', async () => {
        const t = await place({ kind: 'tariff', item_title: 'Standart tarif' });
        expect((await post(`/api/admin/orders/${t.body.id}/decision`, as(T1, 'teacher'), { status: 'confirmed' })).status).toBe(403);
        expect((await post(`/api/admin/orders/${t.body.id}/decision`, as(ADMIN, 'admin'), { status: 'paid' })).status).toBe(400);
        expect((await post(`/api/admin/orders/${t.body.id}/decision`, as(ADMIN, 'admin'), { status: 'confirmed', reply: 'Faollashtirildi' })).status).toBe(200);
        expect((await post(`/api/admin/orders/${t.body.id}/decision`, as(ADMIN, 'admin'), { status: 'rejected' })).status).toBe(404);
        const c = await place({ kind: 'course', item_title: 'x' });
        expect((await post(`/api/admin/orders/${c.body.id}/decision`, as(ADMIN, 'admin'), { status: 'confirmed' })).status).toBe(404); // teachers' business
        expect(s.log).toHaveLength(1);
    });
});

describe('suggestions', () => {
    test('keywords: drops filler words, trims endings, handles apostrophes', () => {
        expect(keywords('Menga Python darsligi kerak')).toEqual(['python']);
        expect(keywords('Dasturlash uchun qo\'llanma')).toEqual(['dastu']);
        expect(keywords('a b 12 kurs')).toEqual([]);
    });
    test('returns scored matches without links, requires login', async () => {
        s.sugg.courses = [{ id: 1, title: 'Python asoslari', description: 'x', category: 'Backend', teacher: 'M', enrolled: 7 }, { id: 2, title: 'Boshqa', description: 'y', category: 'z', teacher: 'M', enrolled: null }];
        s.sugg.mats = [{ id: 9, kind: 'guide', title: 'Python PDF', course_id: 1, course_title: 'Python asoslari', enrolled: null }];
        const r = await request(app).get('/api/orders/suggestions?q=' + encodeURIComponent('Python darsligi kerak')).set(as(STUDENT));
        expect(r.body.courses.map((c) => c.id)).toEqual([1]);          // the unrelated course scored 0
        expect(r.body.courses[0].enrolled).toBe(true);
        expect(r.body.materials[0]).toMatchObject({ id: 9, enrolled: false });
        expect(JSON.stringify(r.body)).not.toContain('url');
        expect((await request(app).get('/api/orders/suggestions?q=x')).status).toBe(401);
        const empty = await request(app).get('/api/orders/suggestions?q=' + encodeURIComponent('menga kerak')).set(as(STUDENT));
        expect(empty.body).toEqual({ courses: [], materials: [] });
    });
});
