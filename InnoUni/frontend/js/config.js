// Configuration for different environments
const config = {
    // Development environment
    development: {
        apiBaseUrl: 'http://localhost:3000/api',
        environment: 'development'
    },
    
    // Production environment
    production: {
        apiBaseUrl: '/api', // Relative path for production
        environment: 'production'
    }
};

// Auto-detect environment or set manually
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const currentEnvironment = isLocal ? 'development' : 'production';

// GitHub Pages only serves static files - it cannot run the Node/MySQL backend.
// Put the public address of the deployed backend here, e.g. 'https://innouni-api.onrender.com/api'
// (that server must list https://<user>.github.io in CORS_ORIGINS). Leave '' to use the same origin ('/api').
const BACKEND_API_URL = '';
if (BACKEND_API_URL) {
    config.production.apiBaseUrl = BACKEND_API_URL;
}
// Without a backend, GitHub Pages has no /api: pages detect this and show a clear message.
config.production.backendMissing = !BACKEND_API_URL && /\.github\.io$/.test(window.location.hostname);

// Export current configuration
const appConfig = config[currentEnvironment];

// Make it globally available
window.config = appConfig;

// For module exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = appConfig;
}
