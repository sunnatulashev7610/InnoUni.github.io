// Simple test for registration endpoint
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'oqiv_platform'
};

const JWT_SECRET = 'test-secret-key';

async function testRegistration() {
    try {
        console.log('Testing registration endpoint...');
        
        // Test database connection
        const db = await mysql.createConnection(dbConfig);
        console.log('Database connected successfully');
        
        // Test user creation
        const hashedPassword = await bcrypt.hash('TestPassword123', 10);
        console.log('Password hashed successfully');
        
        const [result] = await db.execute(
            'INSERT INTO users (full_name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
            ['Test User', 'test@example.com', '+998901234567', hashedPassword, 'student']
        );
        
        console.log('User created with ID:', result.insertId);
        
        // Test JWT token generation
        const token = jwt.sign(
            { userId: result.insertId, email: 'test@example.com', role: 'student' },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        console.log('JWT token generated:', token.substring(0, 20) + '...');
        
        // Test login
        const [users] = await db.execute(
            'SELECT * FROM users WHERE email = ?',
            ['test@example.com']
        );
        
        if (users.length > 0) {
            const user = users[0];
            const isValidPassword = await bcrypt.compare('TestPassword123', user.password);
            console.log('Password validation:', isValidPassword);
            
            if (isValidPassword) {
                console.log('Login test successful!');
                console.log('User data:', {
                    id: user.id,
                    full_name: user.full_name,
                    email: user.email,
                    role: user.role
                });
            }
        }
        
        // Clean up test user
        await db.execute('DELETE FROM users WHERE email = ?', ['test@example.com']);
        console.log('Test user cleaned up');
        
        await db.end();
        console.log('Test completed successfully!');
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testRegistration();
