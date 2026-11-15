// Every authenticated request now re-checks the account in the database (role, blocked).
// Test databases are fakes, so this helper answers that one query from the tokens the test created.
const { invalidateUserCache } = require('../../middleware/roleBased');

const roles = new Map();
const blocked = new Set();

function register(userId, role) {
    roles.set(Number(userId), role);
    invalidateUserCache(userId);
}
function setBlocked(userId, value) { value ? blocked.add(Number(userId)) : blocked.delete(Number(userId)); invalidateUserCache(userId); }

function withAccounts(db) {
    return {
        ...db,
        async execute(sql, params = []) {
            if (/^\s*SELECT role, blocked FROM users WHERE id = \?/.test(sql)) {
                const id = Number(params[0]);
                return [roles.has(id) ? [{ role: roles.get(id), blocked: blocked.has(id) ? 1 : 0 }] : []];
            }
            return db.execute(sql, params);
        }
    };
}

module.exports = { register, setBlocked, withAccounts };
