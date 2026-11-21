process.env.JWT_SECRET = 'test-secret-test-secret-123';
process.env.WRITE_RATE_LIMIT = '3';
const request = require('supertest');
const app = require('../server');

beforeAll(() => app.setDb({ execute: async () => [[]], query: async () => [[]] }));

test('writes have a tighter limit than reads', async () => {
    for (let i = 0; i < 3; i++) expect((await request(app).post('/api/lesson-qa/items/1').send({ body: 'x' })).status).toBe(401);
    const w = await request(app).post('/api/lesson-qa/items/1').send({ body: 'x' });
    expect(w.status).toBe(429);
    expect(w.body.error).toMatch(/slow down/i);
    // reads are still fine
    expect((await request(app).get('/api/student/courses')).status).toBe(401);
});
