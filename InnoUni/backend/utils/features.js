// Features that are built but switched off for now. Turn one on by setting the env var to "true"
// (FEATURE_TEAMS=true, FEATURE_LIBRARY=true). Read on every request, so no restart logic is needed in tests.
const FLAGS = { teams: 'FEATURE_TEAMS', library: 'FEATURE_LIBRARY' };

function isEnabled(name) {
    return process.env[FLAGS[name]] === 'true';
}

function requireFeature(name) {
    return (req, res, next) => {
        if (isEnabled(name)) return next();
        res.status(404).json({ error: 'This feature is not available yet' });
    };
}

module.exports = { isEnabled, requireFeature };
