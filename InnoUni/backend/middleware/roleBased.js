const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Role-based access control middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
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
    authenticateToken,
    requireRole,
    studentOnly,
    teacherOnly,
    adminOnly,
    studentOrTeacher,
    getUserDashboard
};
