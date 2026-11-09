// Demo data for development. Safe to run twice (skips what already exists).
// Usage: SEED_PASSWORD=... npm run seed   (uses the same DB_* env as the server)
const bcrypt = require('bcryptjs');

const USERS = [
    { full_name: 'Demo O\'qituvchi', email: 'teacher@demo.gatheredu.uz', role: 'teacher' },
    { full_name: 'Demo Kapitan', email: 'captain@demo.gatheredu.uz', role: 'student' },
    { full_name: 'Demo Talaba', email: 'student@demo.gatheredu.uz', role: 'student' }
];
const TEAMS = [
    { name: 'Alfa jamoa', description: 'Dasturlash va startap g\'oyalari', topics_done: 12, achievements: 2 },
    { name: 'Beta jamoa', description: 'Dizayn va mahsulot', topics_done: 8, achievements: 1 }
];
const ORDERS = [
    { kind: 'course', item_title: 'JavaScript asoslari', amount: 99000, status: 'pending' },
    { kind: 'material', item_title: 'HTML/CSS konspekt', amount: 0, status: 'confirmed' },
    { kind: 'tariff', item_title: 'Pro tarif', amount: 149000, status: 'rejected' }
];

async function seed(db, password) {
    if (!password || password.length < 8) throw new Error('SEED_PASSWORD (8+ characters) is required');
    const hash = await bcrypt.hash(password, 10);
    const ids = {};
    for (const u of USERS) {
        const [found] = await db.execute('SELECT id FROM users WHERE email = ?', [u.email]);
        if (found.length) { ids[u.email] = found[0].id; continue; }
        const [r] = await db.execute('INSERT INTO users (full_name, email, password, role) VALUES (?, ?, ?, ?)', [u.full_name, u.email, hash, u.role]);
        ids[u.email] = r.insertId;
    }
    const captain = ids['captain@demo.gatheredu.uz'];
    const student = ids['student@demo.gatheredu.uz'];

    const teamIds = [];
    for (const t of TEAMS) {
        const [found] = await db.execute('SELECT id FROM teams WHERE name = ?', [t.name]);
        if (found.length) { teamIds.push(found[0].id); continue; }
        const [r] = await db.execute('INSERT INTO teams (name, description, captain_id, topics_done, achievements) VALUES (?, ?, ?, ?, ?)',
            [t.name, t.description, captain, t.topics_done, t.achievements]);
        await db.execute('INSERT INTO team_members (team_id, user_id, status) VALUES (?, ?, \'active\')', [r.insertId, captain]);
        teamIds.push(r.insertId);
    }
    // One pending, anonymous join request to the first team
    await db.execute('INSERT IGNORE INTO team_members (team_id, user_id, status, anonymous) VALUES (?, ?, \'pending\', 1)', [teamIds[0], student]);

    const [existing] = await db.execute('SELECT id FROM orders WHERE user_id = ?', [student]);
    if (!existing.length) {
        for (const o of ORDERS) {
            await db.execute('INSERT INTO orders (user_id, kind, item_title, amount, status) VALUES (?, ?, ?, ?, ?)',
                [student, o.kind, o.item_title, o.amount, o.status]);
        }
    }
    return { users: USERS.length, teams: TEAMS.length, orders: ORDERS.length };
}

module.exports = { seed };

if (require.main === module) {
    (async () => {
        if (process.env.NODE_ENV === 'production' && !process.env.SEED_FORCE) {
            console.error('Refusing to seed in production (set SEED_FORCE=1 to override)');
            process.exit(1);
        }
        const config = require('./config');
        const mysql = require('mysql2/promise');
        const { runMigrations } = require('./migrate');
        const db = mysql.createPool({
            host: process.env.DB_HOST, port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
            ssl: process.env.DB_SSL ? { minVersion: 'TLSv1.2' } : undefined
        });
        await runMigrations(db);
        console.log('Seeded:', await seed(db, process.env.SEED_PASSWORD));
        await db.end();
    })().catch((e) => { console.error(e.message); process.exit(1); });
}
