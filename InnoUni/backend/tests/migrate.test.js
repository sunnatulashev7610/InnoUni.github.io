const fs = require('fs');
const os = require('os');
const path = require('path');
const { runMigrations } = require('../migrate');

test('runs each migration once, in order', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    fs.writeFileSync(path.join(dir, '002_b.sql'), 'CREATE TABLE b (id INT);');
    fs.writeFileSync(path.join(dir, '001_a.sql'), 'CREATE TABLE a (id INT);\nCREATE TABLE a2 (id INT);');
    const done = [];
    const ran = [];
    const db = {
        query: async (sql, p) => {
            if (sql.startsWith('SELECT name')) return [done.map((name) => ({ name }))];
            if (sql.startsWith('INSERT INTO schema_migrations')) done.push(p[0]);
            else if (sql.startsWith('CREATE TABLE') && !sql.includes('schema_migrations')) ran.push(sql);
            return [[]];
        }
    };
    expect(await runMigrations(db, dir)).toEqual(['001_a.sql', '002_b.sql']);
    expect(ran).toEqual(['CREATE TABLE a (id INT)', 'CREATE TABLE a2 (id INT)', 'CREATE TABLE b (id INT)']);
    expect(await runMigrations(db, dir)).toEqual([]);
});

test('real migration files have only whole statements', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/001_teams_orders.sql'), 'utf8');
    expect((sql.match(/CREATE TABLE/g) || []).length).toBe(3);
});
