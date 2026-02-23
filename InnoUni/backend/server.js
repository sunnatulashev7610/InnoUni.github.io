const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database connection
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'oqiv_platform'
};

let db;

async function initDB() {
    try {
        db = await mysql.createConnection(dbConfig);
        console.log('Database connected successfully');
        
        // Create tables if they don't exist
        await createTables();
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
}

async function createTables() {
    try {
        // Users table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                phone VARCHAR(20),
                password VARCHAR(255) NOT NULL,
                bio TEXT,
                avatar VARCHAR(255),
                role ENUM('student', 'teacher', 'admin') DEFAULT 'student',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Courses table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS courses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                category VARCHAR(100),
                teacher_id INT,
                avatar VARCHAR(255),
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (teacher_id) REFERENCES users(id)
            )
        `);

        // Groups table (for student teams)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS groups (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                logo VARCHAR(255),
                status ENUM('active', 'in_development', 'on_hold') DEFAULT 'active',
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        `);

        // Group members table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS group_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                group_id INT,
                user_id INT,
                role ENUM('member', 'leader') DEFAULT 'member',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES groups(id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE KEY unique_group_user (group_id, user_id)
            )
        `);

        // Course enrollments table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS course_enrollments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                course_id INT,
                user_id INT,
                enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                progress DECIMAL(5,2) DEFAULT 0.00,
                status ENUM('active', 'completed', 'dropped') DEFAULT 'active',
                FOREIGN KEY (course_id) REFERENCES courses(id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE KEY unique_course_user (course_id, user_id)
            )
        `);

        // Tasks table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                course_id INT,
                assigned_to INT,
                priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
                status ENUM('pending', 'in_progress', 'completed') DEFAULT 'pending',
                due_date DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (course_id) REFERENCES courses(id),
                FOREIGN KEY (assigned_to) REFERENCES users(id)
            )
        `);

        // Projects table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS projects (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                group_id INT,
                status ENUM('active', 'completed', 'in_progress') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES groups(id)
            )
        `);

        // Achievements table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS achievements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                icon VARCHAR(100),
                type ENUM('course', 'team', 'personal') DEFAULT 'personal'
            )
        `);

        // User achievements table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_achievements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                achievement_id INT,
                earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (achievement_id) REFERENCES achievements(id),
                UNIQUE KEY unique_user_achievement (user_id, achievement_id)
            )
        `);

        console.log('Tables created/verified successfully');
    } catch (error) {
        console.error('Error creating tables:', error);
    }
}

// JWT Middleware
function authenticateToken(req, res, next) {
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
}

// Middleware to pass database to routes
app.use((req, res, next) => {
    req.db = db;
    next();
});

// Import route handlers
const { router: authRouter, authenticateToken } = require('./api/auth');
const studentRouter = require('./api/student');
const teacherRouter = require('./api/teacher');
const dashboardRouter = require('./api/dashboard');

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/student', studentRouter);
app.use('/api/teacher', teacherRouter);
app.use('/api/dashboard', dashboardRouter);

// Role-based dashboard routing
app.get('/dashboard/:userId', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.userId;
        const tokenUserId = req.user.userId;

        // Check if user is accessing their own dashboard
        if (userId !== tokenUserId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const userRole = req.user.role;
        
        // Redirect to appropriate dashboard based on role
        switch (userRole) {
            case 'student':
                res.sendFile(path.join(__dirname, '../frontend/student.html'));
                break;
            case 'teacher':
                res.sendFile(path.join(__dirname, '../frontend/teacher.html'));
                break;
            case 'admin':
                res.sendFile(path.join(__dirname, '../frontend/teacher.html')); // Admin gets teacher dashboard
                break;
            default:
                res.status(403).json({ error: 'Invalid user role' });
        }
    } catch (error) {
        console.error('Dashboard routing error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        
        // Validate input
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        // Create email transporter
        const transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE || 'gmail',
            auth: {
                user: process.env.EMAIL_USER || 'ulashevsunnat200@gmail.com',
                pass: process.env.EMAIL_PASS || 'your-app-password'
            }
        });
        
        // Email options
        const mailOptions = {
            from: email,
            to: 'ulashevsunnat200@gmail.com',
            subject: `New Contact Form Message from ${name}`,
            html: `
                <h3>New Contact Form Submission</h3>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Message:</strong></p>
                <p>${message}</p>
                <hr>
                <p><small>Sent from Inno Uni Contact Form</small></p>
            `
        };
        
        // Send email
        await transporter.sendMail(mailOptions);
        
        res.status(200).json({ 
            success: true, 
            message: 'Message sent successfully!' 
        });
        
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ 
            error: 'Failed to send message. Please try again later.' 
        });
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Catch-all handler for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

module.exports = app;
