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

test('team details migration is one change per statement (TiDB allows only one per ALTER)', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/007_team_details.sql'), 'utf8');
    const statements = sql.split(/;\s*(?:\r?\n|$)/).map((x) => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(3);
    statements.forEach((x) => {
        expect(x).toMatch(/^ALTER TABLE teams ADD COLUMN \w+ /);
        expect(x).not.toMatch(/,/);
    });
});

test('chat migration: the messages table and one change per ALTER', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/008_team_chat.sql'), 'utf8');
    const statements = sql.split(/;\s*(?:\r?\n|$)/).map((x) => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(4);
    expect(statements[0]).toMatch(/^CREATE TABLE IF NOT EXISTS team_messages/);
    expect(statements[0]).toMatch(/ON DELETE CASCADE/);
    statements.slice(1).forEach((x) => {
        expect(x).toMatch(/^ALTER TABLE \w+ ADD COLUMN \w+ /);
        expect(x).not.toMatch(/,/);
    });
});

test('a change already made by hand is skipped; other errors still stop the start', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    fs.writeFileSync(path.join(dir, '001_a.sql'), 'ALTER TABLE t ADD COLUMN c INT;\nCREATE TABLE a (id INT);');
    const done = []; const ran = [];
    const make = (fail) => ({
        query: async (sql, p) => {
            if (sql.startsWith('SELECT name')) return [done.map((name) => ({ name }))];
            if (sql.startsWith('INSERT INTO schema_migrations')) { done.push(p[0]); return [[]]; }
            if (sql.startsWith('ALTER')) throw Object.assign(new Error('x'), fail);
            if (sql.startsWith('CREATE TABLE a')) ran.push(sql);
            return [[]];
        }
    });
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(await runMigrations(make({ code: 'ER_DUP_FIELDNAME', errno: 1060 }), dir)).toEqual(['001_a.sql']);
    expect(ran).toHaveLength(1);
    log.mockRestore();
    done.length = 0;
    await expect(runMigrations(make({ code: 'ER_PARSE_ERROR', errno: 1064 }), dir)).rejects.toThrow('x');
    expect(done).toEqual([]);
});
