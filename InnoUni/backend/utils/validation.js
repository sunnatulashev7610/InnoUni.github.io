const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt ignores everything after 72 bytes

// Returns an error message, or null when the password is acceptable
function validatePassword(password) {
    if (typeof password !== 'string' || password.length === 0) {
        return 'Password is required';
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
        return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`;
    }
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
        return `Password must be at most ${PASSWORD_MAX_BYTES} bytes long`;
    }
    return null;
}

function isValidEmail(email) {
    return typeof email === 'string' && email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Positive integer from a URL parameter, or null when it is not one
function parseId(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}

const GRADE_MIN = 0;
const GRADE_MAX = 100;

// Returns { value } for a valid grade (number 0..100, max 2 decimals) or { error }
function validateGrade(grade) {
    if (typeof grade !== 'number' || !Number.isFinite(grade)) {
        return { error: 'Grade must be a number' };
    }
    if (grade < GRADE_MIN || grade > GRADE_MAX) {
        return { error: `Grade must be between ${GRADE_MIN} and ${GRADE_MAX}` };
    }
    return { value: Math.round(grade * 100) / 100 };
}

// Returns { value } with trimmed text, or { error }
function validateText(text, { field, required = true, maxLength }) {
    if (text == null || text === '') {
        return required ? { error: `${field} is required` } : { value: null };
    }
    if (typeof text !== 'string') {
        return { error: `${field} must be text` };
    }
    const trimmed = text.trim();
    if (required && trimmed.length === 0) {
        return { error: `${field} is required` };
    }
    if (trimmed.length > maxLength) {
        return { error: `${field} must be at most ${maxLength} characters` };
    }
    return { value: trimmed.length ? trimmed : null };
}

module.exports = {
    validatePassword, isValidEmail, PASSWORD_MIN_LENGTH,
    parseId, validateGrade, validateText, GRADE_MIN, GRADE_MAX
};
