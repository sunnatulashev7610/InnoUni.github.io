// Runs migrations/*.sql in order, once each (tracked in schema_migrations).
// If a change was already made by hand (for example in the SQL editor), the "already exists" error is skipped
// instead of crashing the server on start. Any other error still stops the start.
const ALREADY_THERE = new Set(['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_TABLE_EXISTS_ERROR']);
const ALREADY_THERE_NO = new Set([1060, 1061, 1050]);
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
        for (const s of statements) {
            try { await db.query(s); } catch (e) {
                if (!ALREADY_THERE.has(e.code) && !ALREADY_THERE_NO.has(e.errno)) throw e;
                console.log(`Migration ${file}: already applied, skipped: ${s.slice(0, 60)}`);
            }
        }
        await db.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
        applied.push(file);
    }
    return applied;
}

module.exports = { runMigrations };
