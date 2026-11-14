const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');

// Role-based access control middleware
// A token is valid for 24 hours, but the account may be blocked, deleted or get another role meanwhile.
// So the account state is checked in the database (cached for a short time, and cleared at once when an admin changes it).
const STATUS_TTL_MS = 60 * 1000;
const statusCache = new Map(); // userId -> { at, row }
const invalidateUserCache = (userId) => { if (userId === undefined) statusCache.clear(); else statusCache.delete(Number(userId)); };

async function currentAccount(db, userId) {
    const hit = statusCache.get(userId);
    if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit.row;
    const [rows] = await db.execute('SELECT role, blocked FROM users WHERE id = ?', [userId]);
    const row = rows[0] || null;
    statusCache.set(userId, { at: Date.now(), row });
    return row;
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, async (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        if (req.db && typeof req.db.execute === 'function') {
            let account;
            try {
                account = await currentAccount(req.db, Number(user.userId));
            } catch (e) {
                // The database is unreachable: the route itself will fail too, so do not invent a second error here
                console.error('Account check failed:', e.message);
                req.user = user;
                return next();
            }
            if (!account) return res.status(401).json({ error: 'Account no longer exists' });
            if (account.blocked) return res.status(403).json({ error: 'This account is blocked' });
            user.role = account.role; // the database is the truth, not the role written in the token
        }
        req.user = user;
        next();
    });
};

// Role-specific middleware
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Access denied',
                message: `This resource requires ${roles.join(' or ')} role`
            });
        }

        next();
    };
};

// Student-only access
const studentOnly = requireRole(['student']);

// Teacher-only access
const teacherOnly = requireRole(['teacher', 'admin']);

// Admin-only access
const adminOnly = requireRole(['admin']);

// Student or teacher access
const studentOrTeacher = requireRole(['student', 'teacher', 'admin']);

// A user may only access their own data (admins may access anyone's).
// The user ID always comes from the verified token, never from the URL alone.
const requireSelf = (param = 'userId') => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (req.user.role === 'admin' || Number(req.params[param]) === Number(req.user.userId)) {
            return next();
        }

        return res.status(403).json({ error: 'Access denied' });
    };
};

// Get user dashboard based on role
const getUserDashboard = (req, res, next) => {
    const userRole = req.user.role;
    
    switch (userRole) {
        case 'student':
            req.dashboardType = 'student';
            break;
        case 'teacher':
            req.dashboardType = 'teacher';
            break;
        case 'admin':
            req.dashboardType = 'admin';
            break;
        default:
            return res.status(403).json({ error: 'Invalid user role' });
    }
    
    next();
};

module.exports = {
    invalidateUserCache,
    authenticateToken,
    requireRole,
    requireSelf,
    studentOnly,
    teacherOnly,
    adminOnly,
    studentOrTeacher,
    getUserDashboard
};
