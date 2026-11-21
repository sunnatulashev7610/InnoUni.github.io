process.env.JWT_SECRET = 'test-secret-test-secret-123';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { register, withAccounts } = require('./helpers/accounts');

const as = (id, role = 'student') => ({ Authorization: `Bearer ${jwt.sign({ userId: id, role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
const norm = (q) => q.replace(/\s+/g, ' ').trim();
let reviews, notes;

beforeEach(() => {
    reviews = [{ id: 1, course_id: 7, user_id: 5, rating: 4, comment: 'Yaxshi', created_at: '2026-11-01', full_name: 'Ali Karimov' }];
    notes = [];
    register(5, 'student'); register(6, 'student'); register(8, 'student'); register(3, 'teacher');
    app.setDb(withAccounts({
        query: async () => [[]],
        execute: async (sql, p = []) => {
            const q = norm(sql);
            if (q.startsWith('SELECT id FROM courses WHERE id = ?')) return [p[0] === 7 ? [{ id: 7 }] : []];
            if (q.startsWith('SELECT id, teacher_id, creator_id FROM courses')) return [p[0] === 7 ? [{ id: 7, teacher_id: 3, creator_id: null }] : []];
            if (q.startsWith('SELECT 1 AS ok FROM course_enrollments')) return [[5, 6].includes(p[1]) ? [{ ok: 1 }] : []];
            if (q.startsWith('SELECT rating, COUNT(*) AS n FROM course_reviews')) {
                const m = {}; reviews.filter((r) => r.course_id === p[0]).forEach((r) => { m[r.rating] = (m[r.rating] || 0) + 1; });
                return [Object.entries(m).map(([rating, n]) => ({ rating: Number(rating), n }))];
            }
            if (q.startsWith('SELECT r.id, r.user_id')) return [reviews.filter((r) => r.course_id === p[0]).slice().reverse()];
            if (q.startsWith('SELECT rating, comment FROM course_reviews')) return [reviews.filter((r) => r.course_id === p[0] && r.user_id === p[1])];
            if (q.startsWith('INSERT INTO course_reviews')) {
                const old = reviews.find((r) => r.course_id === p[0] && r.user_id === p[1]);
                if (old) { old.rating = p[2]; old.comment = p[3]; return [{ affectedRows: 2 }]; }
                reviews.push({ id: 9, course_id: p[0], user_id: p[1], rating: p[2], comment: p[3], full_name: 'Vali Aliyev' });
                return [{ affectedRows: 1, insertId: 9 }];
            }
            if (q.startsWith('SELECT title, teacher_id, creator_id FROM courses')) return [[{ title: 'Python', teacher_id: 3, creator_id: null }]];
            if (q.startsWith('INSERT INTO notifications')) { notes.push(p); return [{ insertId: 1 }]; }
            if (q.startsWith('DELETE FROM course_reviews')) { reviews = reviews.filter((r) => !(r.course_id === p[0] && r.user_id === p[1])); return [{}]; }
            throw new Error('unexpected SQL: ' + q);
        }
    }));
});

const put = (id, body, role) => request(app).put('/api/course-reviews/courses/7').set(as(id, role)).send(body);

describe('reading', () => {
    test('needs a login', async () => {
        expect((await request(app).get('/api/course-reviews/courses/7')).status).toBe(401);
    });
    test('summary, short names, own review and the right to review', async () => {
        const res = await request(app).get('/api/course-reviews/courses/7').set(as(5));
        expect(res.status).toBe(200);
        expect(res.body.summary).toEqual({ average: 4, count: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 } });
        expect(res.body.reviews[0]).toMatchObject({ author: 'Ali K.', rating: 4, mine: true });
        expect(res.body.mine).toEqual({ rating: 4, comment: 'Yaxshi' });
        expect(res.body.can_review).toBe(true);
    });
    test('a person outside the course reads but cannot review; unknown course is 404', async () => {
        const res = await request(app).get('/api/course-reviews/courses/7').set(as(8));
        expect(res.body.can_review).toBe(false);
        expect(res.body.reviews[0].mine).toBe(false);
        expect((await request(app).get('/api/course-reviews/courses/99').set(as(5))).status).toBe(404);
        expect((await request(app).get('/api/course-reviews/courses/abc').set(as(5))).status).toBe(400);
    });
});

describe('writing', () => {
    test('an enrolled student adds a rating and the teacher is told', async () => {
        const res = await put(6, { rating: 5, comment: '  Zo\'r kurs  ' });
        expect(res.status).toBe(200);
        expect(res.body.summary.count).toBe(2);
        expect(res.body.summary.average).toBe(4.5);
        expect(res.body.mine).toEqual({ rating: 5, comment: 'Zo\'r kurs' });
        expect(notes).toHaveLength(1);
        expect(notes[0][0]).toBe(3); // the teacher
        expect(notes[0][1]).toBe('review');
    });
    test('changing an own rating replaces it and does not notify again', async () => {
        const res = await put(5, { rating: 2 });
        expect(res.status).toBe(200);
        expect(res.body.summary).toMatchObject({ count: 1, average: 2 });
        expect(notes).toHaveLength(0);
    });
    test.each([[0], [6], [3.5], ['5'], [null], [undefined]])('rating %p is rejected', async (v) => {
        expect((await put(6, { rating: v })).status).toBe(400);
    });
    test('a comment over 500 characters is rejected', async () => {
        expect((await put(6, { rating: 4, comment: 'x'.repeat(501) })).status).toBe(400);
    });
    test('not enrolled, the teacher and strangers cannot rate', async () => {
        expect((await put(8, { rating: 5 })).status).toBe(403);
        expect((await put(3, { rating: 5 }, 'teacher')).status).toBe(403);
        expect(reviews).toHaveLength(1);
    });
    test('a student removes only their own rating', async () => {
        const res = await request(app).delete('/api/course-reviews/courses/7').set(as(6));
        expect(res.status).toBe(200);
        expect(reviews).toHaveLength(1);
        const mine = await request(app).delete('/api/course-reviews/courses/7').set(as(5));
        expect(mine.body.summary.count).toBe(0);
        expect(mine.body.summary.average).toBeNull();
    });
});
