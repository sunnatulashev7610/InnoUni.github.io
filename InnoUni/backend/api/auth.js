const express = require('express');
const bcrypt = require('bcryptjs');
const loginGuard = require('../utils/loginGuard');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { JWT_SECRET } = require('../config');
const { validatePassword, isValidEmail } = require('../utils/validation');

// Single shared JWT verification middleware
const { authenticateToken, invalidateUserCache } = require('../middleware/roleBased');
const mailer = require('../utils/mailer');
const { createToken, consumeToken, sentRecently } = require('../utils/authTokens');

const frontendUrl = () => (process.env.FRONTEND_URL || 'https://sunnatulashev7610.github.io/InnoUni.github.io/InnoUni').replace(/\/+$/, '');

// Mail problems must never break the request that triggered them
async function sendVerification(db, userId, email) {
    if (!mailer.isConfigured()) return false;
    try {
        const token = await createToken(db, userId, 'verify', 24 * 60);
        await mailer.sendMail({
            to: email,
            subject: 'Gather Edu: emailingizni tasdiqlang',
            text: `Salom!\n\nEmailingizni tasdiqlash uchun havolani oching (24 soat amal qiladi):\n${frontendUrl()}/secondary-pages/login/verify-email.html?token=${token}\n\nAgar siz ro'yxatdan o'tmagan bo'lsangiz, bu xatga e'tibor bermang.`
        });
        return true;
    } catch (e) {
        console.error('Verification mail failed:', e.message);
        return false;
    }
}

// Register new user
router.post('/register', async (req, res) => {
    try {
        const db = req.db;
        const { full_name, phone, password, role = 'student' } = req.body;
        // Emails are case-insensitive: one address is one account (TiDB compares them case-sensitively)
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : req.body.email;

        // Validation
        if (!full_name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }

        if (typeof full_name !== 'string' || !isValidEmail(email)) {
            return res.status(400).json({ error: 'Valid name and email are required' });
        }
        const cleanName = full_name.trim().replace(/\s+/g, ' ');
        if (cleanName.length < 2 || cleanName.length > 100) {
            return res.status(400).json({ error: 'Name must be 2-100 characters' });
        }
        const cleanPhone = phone === undefined || phone === null || phone === '' ? null : (typeof phone === 'string' ? phone.trim() : false);
        if (cleanPhone === false || (cleanPhone && !/^\+?[0-9 ()-]{7,20}$/.test(cleanPhone))) {
            return res.status(400).json({ error: 'Invalid phone number' });
        }

        // Validate role. Admin accounts are never self-registered: they are created manually in the database.
        const validRoles = ['student', 'teacher'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role specified' });
        }

        // Validate password strength before touching the database
        const passwordError = validatePassword(password);
        if (passwordError) {
            return res.status(400).json({ error: passwordError });
        }

        // Check if user already exists
        const [existingUsers] = await db.execute(
            'SELECT id FROM users WHERE LOWER(email) = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const [result] = await db.execute(
            'INSERT INTO users (full_name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
            [cleanName, email, cleanPhone, hashedPassword, role]
        );

        // Get the created user for response
        sendVerification(db, result.insertId, email); // in the background: the user does not wait for the mail

        const [newUser] = await db.execute(
            'SELECT id, full_name, email, phone, role, avatar, bio, created_at FROM users WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json({ 
            message: 'User registered successfully',
            user: newUser[0]
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const db = req.db;
        const { password, role } = req.body;
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : req.body.email;

        // Validation
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (typeof email !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const lockMs = loginGuard.lockedFor(email);
        if (lockMs) {
            res.set('Retry-After', String(Math.ceil(lockMs / 1000)));
            return res.status(429).json({ error: 'Too many failed attempts. Try again later' });
        }

        // Find user
        const [users] = await db.execute(
            'SELECT * FROM users WHERE LOWER(email) = ?',
            [email]
        );

        if (users.length === 0) {
            loginGuard.recordFailure(email);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = users[0];
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            loginGuard.recordFailure(email);
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        loginGuard.recordSuccess(email);

        if (user.blocked) {
            return res.status(403).json({ error: 'This account is blocked' });
        }

        // Check if role matches (if specified)
        if (role && user.role !== role) {
            return res.status(403).json({ 
                error: 'Role mismatch',
                message: `This account is registered as ${user.role}, not ${role}`
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.id, 
                email: user.email, 
                role: user.role,
                tv: Number(user.token_version || 0)
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatar: user.avatar,
                bio: user.bio,
                email_verified: Number(user.email_verified) === 1
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const db = req.db;
        const userId = req.user.userId;

        const [users] = await db.execute(
            'SELECT id, full_name, email, phone, bio, avatar, role, email_verified, created_at FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: users[0], mail_enabled: mailer.isConfigured() });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const AVATAR_MAX = 40000;
const AVATAR_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

// Update user profile. Only the fields that are sent change; every field is validated.
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const db = req.db;
        const userId = req.user.userId;
        const body = req.body || {};
        const updates = {};

        if (body.full_name !== undefined) {
            const name = typeof body.full_name === 'string' ? body.full_name.trim().replace(/\s+/g, ' ') : '';
            if (name.length < 2 || name.length > 100) {
                return res.status(400).json({ error: 'Name must be 2-100 characters' });
            }
            updates.full_name = name;
        }
        if (body.email !== undefined) {
            const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
            if (!isValidEmail(email)) {
                return res.status(400).json({ error: 'Invalid email' });
            }
            updates.email = email;
        }
        if (body.phone !== undefined) {
            const phone = body.phone === null ? '' : typeof body.phone === 'string' ? body.phone.trim() : null;
            if (phone === null || phone.length > 20 || (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone))) {
                return res.status(400).json({ error: 'Invalid phone number' });
            }
            updates.phone = phone || null;
        }
        if (body.bio !== undefined) {
            const bio = body.bio === null ? '' : typeof body.bio === 'string' ? body.bio.trim() : null;
            if (bio === null || bio.length > 500) {
                return res.status(400).json({ error: 'Bio must be at most 500 characters' });
            }
            updates.bio = bio || null;
        }

        if (body.avatar !== undefined) {
            // A small picture kept right in the row: null removes it, otherwise a jpeg/png/webp data URL under 40 KB
            if (body.avatar === null || body.avatar === '') {
                updates.avatar = null;
            } else if (typeof body.avatar === 'string' && body.avatar.length <= AVATAR_MAX && AVATAR_RE.test(body.avatar)) {
                updates.avatar = body.avatar;
            } else {
                return res.status(400).json({ error: 'Invalid avatar image' });
            }
        }

        const columns = Object.keys(updates);
        if (columns.length === 0) {
            return res.status(400).json({ error: 'Nothing to update' });
        }

        if (updates.email) {
            const [existingUsers] = await db.execute(
                'SELECT id FROM users WHERE LOWER(email) = ? AND id != ?',
                [updates.email, userId]
            );
            if (existingUsers.length > 0) {
                return res.status(400).json({ error: 'Email is already taken' });
            }
        }

        // Column names come from the fixed list above, never from the request
        await db.execute(
            `UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
            [...columns.map((c) => updates[c]), userId]
        );

        const [rows] = await db.execute(
            'SELECT id, full_name, email, phone, bio, avatar, role, created_at FROM users WHERE id = ?',
            [userId]
        );
        res.json({ message: 'Profile updated successfully', user: rows[0] });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Change password
router.put('/password', authenticateToken, async (req, res) => {
    try {
        const db = req.db;
        const userId = req.user.userId;
        const { current_password, new_password } = req.body;

        // Validation
        if (!current_password || !new_password) {
            return res.status(400).json({ error: 'Current and new passwords are required' });
        }

        // Same password rules as registration
        const passwordError = validatePassword(new_password);
        if (passwordError) {
            return res.status(400).json({ error: passwordError });
        }

        // Get current user
        const [users] = await db.execute(
            'SELECT password FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify current password
        const isValidPassword = await bcrypt.compare(current_password, users[0].password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const hashedNewPassword = await bcrypt.hash(new_password, 10);

        // Update password
        // Raising token_version signs out every other device; this one gets a fresh token
        await db.execute(
            'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
            [hashedNewPassword, userId]
        );
        invalidateUserCache(userId);
        const [fresh] = await db.execute('SELECT email, role, token_version FROM users WHERE id = ?', [userId]);
        const token = jwt.sign(
            { userId, email: fresh[0].email, role: fresh[0].role, tv: Number(fresh[0].token_version || 0) },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ message: 'Password changed successfully', token });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete the account for good. Needs the current password. A teacher who still owns courses must remove them first,
// and the last admin cannot leave. Everything else of the user goes with the row (foreign keys cascade).
router.delete('/account', authenticateToken, async (req, res) => {
    try {
        const db = req.db;
        const userId = req.user.userId;
        const password = req.body && req.body.password;
        if (typeof password !== 'string' || !password) {
            return res.status(400).json({ error: 'Password is required' });
        }
        const [users] = await db.execute('SELECT id, role, password FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (!(await bcrypt.compare(password, users[0].password))) {
            return res.status(401).json({ error: 'Password is incorrect' });
        }
        if (users[0].role === 'admin') {
            const [admins] = await db.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
            if (Number(admins[0].n) <= 1) {
                return res.status(409).json({ error: 'The last admin cannot be deleted', code: 'LAST_ADMIN' });
            }
        }
        const [owned] = await db.execute('SELECT COUNT(*) AS n FROM courses WHERE teacher_id = ? OR creator_id = ?', [userId, userId]);
        if (Number(owned[0].n) > 0) {
            return res.status(409).json({ error: 'Delete your courses first', code: 'OWNS_COURSES' });
        }
        // Tables made by server.js have foreign keys without ON DELETE, so those rows are cleared by hand first.
        // One transaction when the pool offers it: either everything goes or nothing does.
        const conn = typeof db.getConnection === 'function' ? await db.getConnection() : null;
        const q = conn || db;
        try {
            if (conn) await conn.beginTransaction();
            await q.execute('DELETE FROM group_members WHERE user_id = ?', [userId]);
            await q.execute('DELETE FROM course_enrollments WHERE user_id = ?', [userId]);
            await q.execute('DELETE FROM user_achievements WHERE user_id = ?', [userId]);
            await q.execute('UPDATE `groups` SET created_by = NULL WHERE created_by = ?', [userId]);
            await q.execute('UPDATE tasks SET assigned_to = NULL WHERE assigned_to = ?', [userId]);
            await q.execute('DELETE FROM users WHERE id = ?', [userId]);
            if (conn) await conn.commit();
        } catch (err) {
            if (conn) await conn.rollback().catch(() => {});
            throw err;
        } finally {
            if (conn) conn.release();
        }
        invalidateUserCache(userId);
        res.json({ message: 'Account deleted' });
    } catch (error) {
        console.error('Account delete error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify token (for frontend token validation)
// ---- E-mail verification and password reset (one-time links sent by e-mail) ----

// The link from the e-mail lands here
router.post('/verify-email', async (req, res) => {
    try {
        const userId = await consumeToken(req.db, req.body && req.body.token, 'verify');
        if (!userId) return res.status(400).json({ error: 'This link is invalid or has expired' });
        await req.db.execute('UPDATE users SET email_verified = 1 WHERE id = ?', [userId]);
        invalidateUserCache(userId);
        res.json({ message: 'Email confirmed' });
    } catch (error) {
        console.error('Verify email error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Ask for a new verification mail (at most one per minute)
router.post('/resend-verification', authenticateToken, async (req, res) => {
    try {
        const db = req.db;
        if (!mailer.isConfigured()) return res.status(503).json({ error: 'Email sending is not set up yet' });
        const [rows] = await db.execute('SELECT email, email_verified FROM users WHERE id = ?', [req.user.userId]);
        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        if (Number(rows[0].email_verified) === 1) return res.json({ message: 'Email is already confirmed' });
        if (await sentRecently(db, req.user.userId, 'verify', 60)) return res.status(429).json({ error: 'Please wait a minute before asking again' });
        const sent = await sendVerification(db, req.user.userId, rows[0].email);
        if (!sent) return res.status(502).json({ error: 'Could not send the email, try again later' });
        res.json({ message: 'Verification email sent' });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// "Forgot password": the answer is always the same, so nobody can find out which emails are registered
router.post('/forgot-password', async (req, res) => {
    const reply = { message: 'If this email is registered, a reset link has been sent' };
    try {
        const db = req.db;
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        if (!isValidEmail(email)) return res.status(400).json({ error: 'Valid email is required' });
        if (!mailer.isConfigured()) return res.status(503).json({ error: 'Email sending is not set up yet' });
        const [rows] = await db.execute('SELECT id, email, blocked FROM users WHERE LOWER(email) = ?', [email]);
        if (rows.length && !rows[0].blocked && !(await sentRecently(db, rows[0].id, 'reset', 60))) {
            try {
                const token = await createToken(db, rows[0].id, 'reset', 60);
                await mailer.sendMail({
                    to: rows[0].email,
                    subject: 'Gather Edu: parolni tiklash',
                    text: `Salom!\n\nParolni tiklash uchun havolani oching (1 soat amal qiladi):\n${frontendUrl()}/secondary-pages/login/reset-password.html?token=${token}\n\nAgar siz so'ramagan bo'lsangiz, bu xatga e'tibor bermang: parolingiz o'zgarmaydi.`
                });
            } catch (e) {
                console.error('Reset mail failed:', e.message);
            }
        }
        res.json(reply);
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const db = req.db;
        const { token, password } = req.body || {};
        const passwordError = validatePassword(password);
        if (passwordError) return res.status(400).json({ error: passwordError });
        const userId = await consumeToken(db, token, 'reset');
        if (!userId) return res.status(400).json({ error: 'This link is invalid or has expired' });
        await db.execute('UPDATE users SET password = ?, email_verified = 1, token_version = token_version + 1 WHERE id = ?', [await bcrypt.hash(password, 10), userId]);
        invalidateUserCache(userId); // opening the mailed link also proves the address is theirs
        await db.execute("UPDATE auth_tokens SET used_at = NOW() WHERE user_id = ? AND kind = 'reset' AND used_at IS NULL", [userId]);
        res.json({ message: 'Password changed. You can sign in now' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/verify', authenticateToken, (req, res) => {
    res.json({ 
        valid: true, 
        user: {
            userId: req.user.userId,
            email: req.user.email,
            role: req.user.role
        }
    });
});

module.exports = { router, authenticateToken };
