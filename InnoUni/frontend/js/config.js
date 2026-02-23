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
const currentEnvironment = window.location.hostname === 'localhost' ? 'development' : 'production';

// Export current configuration
const appConfig = config[currentEnvironment];

// Make it globally available
window.config = appConfig;

// For module exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = appConfig;
}
