const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { JWT_SECRET } = require('../config');
const { validatePassword, isValidEmail } = require('../utils/validation');

// Single shared JWT verification middleware
const { authenticateToken } = require('../middleware/roleBased');

// Register new user
router.post('/register', async (req, res) => {
    try {
        const db = req.db;
        const { full_name, email, phone, password, role = 'student' } = req.body;

        // Validation
        if (!full_name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }

        if (typeof full_name !== 'string' || !isValidEmail(email)) {
            return res.status(400).json({ error: 'Valid name and email are required' });
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
            'SELECT id FROM users WHERE email = ?',
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
            [full_name, email, phone, hashedPassword, role]
        );

        // Get the created user for response
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
        const { email, password, role } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user
        const [users] = await db.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = users[0];
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
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
                role: user.role 
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
                bio: user.bio
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
            'SELECT id, full_name, email, phone, bio, avatar, role, created_at FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: users[0] });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const db = req.db;
        const userId = req.user.userId;
        const { full_name, email, phone, bio } = req.body;

        // Check if email is being changed and if it's already taken
        if (email) {
            const [existingUsers] = await db.execute(
                'SELECT id FROM users WHERE email = ? AND id != ?',
                [email, userId]
            );

            if (existingUsers.length > 0) {
                return res.status(400).json({ error: 'Email is already taken' });
            }
        }

        await db.execute(
            'UPDATE users SET full_name = ?, email = ?, phone = ?, bio = ? WHERE id = ?',
            [full_name, email, phone, bio, userId]
        );

        res.json({ message: 'Profile updated successfully' });
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
        await db.execute(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedNewPassword, userId]
        );

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify token (for frontend token validation)
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
