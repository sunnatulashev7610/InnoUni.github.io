// The teacher cabinet is closed by default in production (FEATURE_TEACHERS); the older tests exercise it, so it is open here.
// tests/teachers-closed.test.js switches it off for its own checks.
process.env.FEATURE_TEACHERS = 'true';
