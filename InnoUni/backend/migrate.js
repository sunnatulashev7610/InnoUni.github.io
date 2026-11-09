// Runs migrations/*.sql in order, once each (tracked in schema_migrations).
const fs = require('fs');
const path = require('path');

async function runMigrations(db, dir = path.join(__dirname, 'migrations')) {
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    const [rows] = await db.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const applied = [];
    for (const file of files) {
        if (done.has(file)) continue;
        const statements = fs.readFileSync(path.join(dir, file), 'utf8').split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean);
        for (const s of statements) await db.query(s);
        await db.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
        applied.push(file);
    }
    return applied;
}

module.exports = { runMigrations };
