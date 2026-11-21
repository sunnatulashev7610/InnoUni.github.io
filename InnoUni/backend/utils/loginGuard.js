// Slows down password guessing per account (the IP limiter alone does not stop a spread-out attack).
// In memory: it resets when the server restarts, which is fine for a short lock.
const MAX_FAILS = Number(process.env.LOGIN_MAX_FAILS) || 10;
const WINDOW_MS = Number(process.env.LOGIN_LOCK_MS) || 15 * 60 * 1000;
const fails = new Map(); // email -> { n, first, lockedUntil }

function key(email) { return String(email || '').trim().toLowerCase().slice(0, 254); }

function lockedFor(email) {
    const f = fails.get(key(email));
    if (!f) return 0;
    if (f.lockedUntil && f.lockedUntil > Date.now()) return f.lockedUntil - Date.now();
    if (Date.now() - f.first > WINDOW_MS) fails.delete(key(email));
    return 0;
}
function recordFailure(email) {
    const k = key(email); const now = Date.now();
    let f = fails.get(k);
    if (!f || now - f.first > WINDOW_MS) f = { n: 0, first: now, lockedUntil: 0 };
    f.n += 1;
    if (f.n >= MAX_FAILS) f.lockedUntil = now + WINDOW_MS;
    fails.set(k, f);
    if (fails.size > 5000) { for (const [x, v] of fails) if (now - v.first > WINDOW_MS) fails.delete(x); }
}
function recordSuccess(email) { fails.delete(key(email)); }
function reset() { fails.clear(); }

module.exports = { lockedFor, recordFailure, recordSuccess, reset, MAX_FAILS };
