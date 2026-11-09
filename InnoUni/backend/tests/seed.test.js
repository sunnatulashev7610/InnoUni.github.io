const { seed } = require('../seed');

const makeDb = () => {
    const t = { users: [], teams: [], members: [], orders: [] };
    let id = 1;
    return {
        t,
        async execute(sql, p = []) {
            const q = sql.replace(/\s+/g, ' ').trim();
            if (q.startsWith('SELECT id FROM users')) return [t.users.filter((u) => u.email === p[0])];
            if (q.startsWith('INSERT INTO users')) { const u = { id: id++, email: p[1], password: p[2], role: p[3] }; t.users.push(u); return [{ insertId: u.id }]; }
            if (q.startsWith('SELECT id FROM teams')) return [t.teams.filter((x) => x.name === p[0])];
            if (q.startsWith('INSERT INTO teams')) { const x = { id: id++, name: p[0], captain_id: p[2] }; t.teams.push(x); return [{ insertId: x.id }]; }
            if (q.startsWith('INSERT INTO team_members') || q.startsWith('INSERT IGNORE INTO team_members')) {
                if (!t.members.some((m) => m.team_id === p[0] && m.user_id === p[1])) t.members.push({ team_id: p[0], user_id: p[1] });
                return [{}];
            }
            if (q.startsWith('SELECT id FROM orders')) return [t.orders.filter((o) => o.user_id === p[0])];
            if (q.startsWith('INSERT INTO orders')) { t.orders.push({ user_id: p[0] }); return [{}]; }
            throw new Error('Unexpected: ' + q);
        }
    };
};

test('requires a password', async () => {
    await expect(seed(makeDb(), '')).rejects.toThrow('SEED_PASSWORD');
});

test('seeds demo data with hashed passwords, and twice gives the same result', async () => {
    const db = makeDb();
    await seed(db, 'demo-pass-123');
    const first = JSON.stringify(Object.fromEntries(Object.entries(db.t).map(([k, v]) => [k, v.length])));
    expect(db.t.users.every((u) => u.password.startsWith('$2'))).toBe(true);
    expect(db.t.users.map((u) => u.role).sort()).toEqual(['student', 'student', 'teacher']);
    await seed(db, 'demo-pass-123');
    expect(JSON.stringify(Object.fromEntries(Object.entries(db.t).map(([k, v]) => [k, v.length])))).toBe(first);
});
