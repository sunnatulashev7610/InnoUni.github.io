const config = require('./config'); // loads .env and validates required settings
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const path = require('path');
const nodemailer = require('nodemailer');

const { authenticateToken } = require('./middleware/roleBased');
const { router: authRouter } = require('./api/auth');
const studentRouter = require('./api/student');
const teacherRouter = require('./api/teacher');
const dashboardRouter = require('./api/dashboard');
const { escapeHtml } = require('./utils/escapeHtml');
const { isValidEmail } = require('./utils/validation');

const app = express();
const PORT = process.env.PORT || 3000;

// Behind a reverse proxy (Render, Heroku, nginx) set TRUST_PROXY=1 so rate limits see real client IPs
if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

// Middleware
// CSP is off for now: the pages rely on inline scripts and CDN assets. Other helmet headers stay on.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigins }));
app.use(bodyParser.json({ limit: '100kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again later' }
});

const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many messages, please try again later' }
});

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
        db = mysql.createPool({
            ...dbConfig,
            waitForConnections: true,
            connectionLimit: 10
        });
        await db.query('SELECT 1'); // fail fast if the database is unreachable
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

        // Groups table (for student teams). "groups" is a reserved word in MySQL 8.0.2+, so it is quoted.
        await db.execute(`
            CREATE TABLE IF NOT EXISTS \`groups\` (
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
                FOREIGN KEY (group_id) REFERENCES \`groups\`(id),
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

        // Task submissions table (student answers and teacher grades)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS task_submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                task_id INT NOT NULL,
                student_id INT NOT NULL,
                content TEXT NOT NULL,
                status ENUM('submitted', 'graded') DEFAULT 'submitted',
                grade DECIMAL(5,2) NULL,
                feedback TEXT NULL,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                graded_at TIMESTAMP NULL,
                graded_by INT NULL,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL,
                UNIQUE KEY unique_task_student (task_id, student_id)
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
                FOREIGN KEY (group_id) REFERENCES \`groups\`(id)
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

// Middleware to pass database to routes
app.use((req, res, next) => {
    req.db = db;
    next();
});

// API Routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRouter);
app.use('/api/student', studentRouter);
app.use('/api/teacher', teacherRouter);
app.use('/api/dashboard', authenticateToken, dashboardRouter);

// Role-based dashboard routing
app.get('/dashboard/:userId', authenticateToken, async (req, res) => {
    try {
        const userId = Number(req.params.userId);
        const tokenUserId = Number(req.user.userId);

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
app.post('/api/contact', contactLimiter, async (req, res) => {
    try {
        const { name, email, message } = req.body;

        // Validate input
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (
            typeof name !== 'string' || name.length > 100 ||
            typeof message !== 'string' || message.length > 5000 ||
            !isValidEmail(email)
        ) {
            return res.status(400).json({ error: 'Invalid name, email or message' });
        }

        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.error('Contact form: EMAIL_USER / EMAIL_PASS are not configured');
            return res.status(503).json({ error: 'Contact form is temporarily unavailable.' });
        }

        // Create email transporter
        const transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE || 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // Email options: "from" is our own account (spoofing the visitor's address gets mail rejected),
        // the visitor can be answered through replyTo.
        const safeName = escapeHtml(name);
        const mailOptions = {
            from: process.env.EMAIL_USER,
            replyTo: email,
            to: process.env.CONTACT_TO || process.env.EMAIL_USER,
            subject: `New Contact Form Message from ${name.replace(/[\r\n]+/g, ' ')}`,
            html: `
                <h3>New Contact Form Submission</h3>
                <p><strong>Name:</strong> ${safeName}</p>
                <p><strong>Email:</strong> ${escapeHtml(email)}</p>
                <p><strong>Message:</strong></p>
                <p>${escapeHtml(message).replace(/\r?\n/g, '<br>')}</p>
                <hr>
                <p><small>Sent from Gather Edu Contact Form</small></p>
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

// Serve the site. URLs mirror the folder layout (/css/..., /imgs/..., /secondary-pages/...), so the
// same relative links work here, on GitHub Pages and on a plain static server.
// Only these folders are exposed, never the project root: backend/ holds the source code and .env.
const siteRoot = path.join(__dirname, '..');
['css', 'imgs', 'style', 'secondary-pages', 'frontend'].forEach((dir) => {
    app.use(`/${dir}`, express.static(path.join(siteRoot, dir)));
});
app.use(express.static(path.join(siteRoot, 'frontend')));

app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(siteRoot, 'index.html'));
});

// Catch-all handler: unknown pages fall back to the home page
app.get('*', (req, res) => {
    res.sendFile(path.join(siteRoot, 'index.html'));
});

// Lets tests inject a fake database without connecting to MySQL
app.setDb = (database) => {
    db = database;
};

// Start the server only when run directly (node server.js), not when required by tests
if (require.main === module) {
    initDB().then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    });
}

module.exports = app;
