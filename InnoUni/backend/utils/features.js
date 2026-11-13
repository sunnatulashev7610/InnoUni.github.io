// Feature switches. Each has a default; the env var overrides it with "true" or "false"
// (FEATURE_TEAMS=false closes Teams, FEATURE_LIBRARY=true opens the Library).
// Read on every request, so no restart logic is needed in tests.
const FLAGS = {
    teams: { env: 'FEATURE_TEAMS', fallback: true },
    library: { env: 'FEATURE_LIBRARY', fallback: false }
};

function isEnabled(name) {
    const flag = FLAGS[name];
    const value = process.env[flag.env];
    if (value === 'true') return true;
    if (value === 'false') return false;
    return flag.fallback;
}

function requireFeature(name) {
    return (req, res, next) => {
        if (isEnabled(name)) return next();
        res.status(404).json({ error: 'This feature is not available yet' });
    };
}

module.exports = { isEnabled, requireFeature };
