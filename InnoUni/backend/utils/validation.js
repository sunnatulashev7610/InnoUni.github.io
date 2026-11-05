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

module.exports = { validatePassword, isValidEmail, PASSWORD_MIN_LENGTH };
