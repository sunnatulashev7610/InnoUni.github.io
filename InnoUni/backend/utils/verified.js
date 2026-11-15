// Optional rule (REQUIRE_EMAIL_VERIFICATION=true): some actions need a confirmed e-mail address.
// Off by default so nothing breaks while the mail service is not set up.
function requireVerifiedEmail(req, res, next) {
    if (process.env.REQUIRE_EMAIL_VERIFICATION !== 'true') return next();
    req.db.execute('SELECT email_verified FROM users WHERE id = ?', [req.user.userId])
        .then(([rows]) => {
            if (rows[0] && Number(rows[0].email_verified) === 1) return next();
            res.status(403).json({ error: 'Confirm your email address first', code: 'EMAIL_NOT_VERIFIED' });
        })
        .catch((e) => { console.error('Verified check failed:', e.message); res.status(500).json({ error: 'Internal server error' }); });
}
module.exports = { requireVerifiedEmail };
