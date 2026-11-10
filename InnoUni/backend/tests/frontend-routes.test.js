// Every API path the frontend calls must exist in the backend (a missing route made login bounce back).
const fs = require('fs');
const path = require('path');

const front = path.join(__dirname, '../../frontend/js');
const api = path.join(__dirname, '../api');
// authHandler.logout() never reaches its /auth/logout call (the token is cleared first), so it is allowed
const allowed = ['/auth/logout'];
const mounts = { student: 'student.js', teacher: 'teacher.js', dashboard: 'dashboard.js', auth: 'auth.js' };

test('frontend api.request paths match backend routes', () => {
    const missing = [];
    for (const file of fs.readdirSync(front).filter((f) => f.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(front, file), 'utf8');
        for (const m of src.matchAll(/request\(\s*[`'"]\/([a-z]+)\/([a-zA-Z-]+)/g)) {
            const [, mount, seg] = m;
            if (!mounts[mount]) continue;
            const routes = fs.readFileSync(path.join(api, mounts[mount]), 'utf8');
            if (!allowed.includes(`/${mount}/${seg}`) && !routes.includes(`'/${seg}`)) missing.push(`${file}: /${mount}/${seg}`);
        }
    }
    expect(missing).toEqual([]);
});
