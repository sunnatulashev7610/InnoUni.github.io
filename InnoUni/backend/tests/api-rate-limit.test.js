process.env.JWT_SECRET = 'test-secret-test-secret-123';
process.env.API_RATE_LIMIT = '6';
process.env.WRITE_RATE_LIMIT = '3';
const request = require('supertest');
const app = require('../server');

beforeAll(() => app.setDb({ execute: async () => [[]], query: async () => [[]] }));

test('reads are limited per IP; the health check is not', async () => {
    for (let i = 0; i < 6; i++) expect((await request(app).get('/api/student/courses')).status).toBe(401);
    const r = await request(app).get('/api/student/courses');
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/slow down/i);
    expect((await request(app).get('/api/health')).status).toBe(200);
});
