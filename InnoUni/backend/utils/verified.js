// Confirmed e-mail is required for every action that changes something (see middleware/roleBased.js and the
// checks on teacher/AI routes). Reading stays open, so a new person can look around while the mail arrives.
//   REQUIRE_EMAIL_VERIFICATION=true   always required
//   REQUIRE_EMAIL_VERIFICATION=false  never required
//   not set                           required as soon as the mail service is configured (without it nobody could confirm)
const mailer = require('./mailer');

function verificationRequired() {
    const flag = process.env.REQUIRE_EMAIL_VERIFICATION;
    if (flag === 'true') return true;
    if (flag === 'false') return false;
    return mailer.isConfigured();
}

function requireVerifiedEmail(req, res, next) {
    if (!verificationRequired()) return next();
    req.db.execute('SELECT email_verified FROM users WHERE id = ?', [req.user.userId])
        .then(([rows]) => {
            if (rows[0] && Number(rows[0].email_verified) === 1) return next();
            res.status(403).json({ error: 'Confirm your email address first', code: 'EMAIL_NOT_VERIFIED' });
        })
        .catch((e) => { console.error('Verified check failed:', e.message); res.status(500).json({ error: 'Internal server error' }); });
}
module.exports = { requireVerifiedEmail, verificationRequired };
