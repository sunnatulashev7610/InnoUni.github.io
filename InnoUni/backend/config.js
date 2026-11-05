const path = require('path');

// Load backend/.env no matter which directory the server is started from
require('dotenv').config({ path: path.join(__dirname, '.env') });

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 16) {
    throw new Error(
        'JWT_SECRET is missing or too short (min 16 characters). ' +
        'Copy backend/.env.example to backend/.env and set a long random value.'
    );
}

// Comma-separated list of origins allowed to call the API from a browser
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

module.exports = { JWT_SECRET, corsOrigins };
