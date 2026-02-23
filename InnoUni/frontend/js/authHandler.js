// Authentication Handler for Role-Based Routing
class AuthHandler {
    constructor() {
        this.init();
    }

    init() {
        this.checkAuthStatus();
        this.setupAuthListeners();
    }

    checkAuthStatus() {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || 'null');
        const userRole = localStorage.getItem('userRole');

        if (token && user && userRole) {
            // User is logged in, check if on correct page
            this.redirectToDashboard(user.id, userRole);
        }
    }

    setupAuthListeners() {
        // Listen for storage changes (for multi-tab support)
        window.addEventListener('storage', (e) => {
            if (e.key === 'token' || e.key === 'user' || e.key === 'userRole') {
                this.checkAuthStatus();
            }
        });

        // Setup logout functionality
        this.setupLogout();
    }

    setupLogout() {
        // Add logout buttons to any existing logout elements
        const logoutButtons = document.querySelectorAll('.logout-btn, [data-action="logout"]');
        logoutButtons.forEach(btn => {
            btn.addEventListener('click', () => this.logout());
        });

        // Create global logout function
        window.logout = () => this.logout();
    }

    async logout() {
        try {
            // Clear local storage
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('userRole');

            // Call logout API if available
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    await api.request('/auth/logout', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                } catch (error) {
                    console.log('Logout API call failed:', error);
                }
            }

            // Redirect to login page
            window.location.href = '/secondary.html/login/login.html';
        } catch (error) {
            console.error('Logout error:', error);
            // Fallback redirect
            window.location.href = '/secondary.html/login/login.html';
        }
    }

    redirectToDashboard(userId, userRole) {
        const currentPath = window.location.pathname;
        
        // Check if already on dashboard
        if (currentPath.includes('/dashboard/')) {
            return; // Already on dashboard, no redirect needed
        }

        // Redirect based on role
        if (userRole === 'teacher' || userRole === 'admin') {
            window.location.href = `/dashboard/${userId}`;
        } else {
            window.location.href = `/dashboard/${userId}`;
        }
    }

    // Method to check if user has specific role
    hasRole(role) {
        const userRole = localStorage.getItem('userRole');
        return userRole === role;
    }

    // Method to check if user is authenticated
    isAuthenticated() {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        return !!(token === null || user === null);
    }

    // Method to get current user info
    getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem('user') || '{}');
        } catch (error) {
            return {};
        }
    }

    // Method to get current user role
    getCurrentRole() {
        return localStorage.getItem('userRole') || 'guest';
    }

    // Method to update user info in storage
    updateUser(userData) {
        localStorage.setItem('user', JSON.stringify(userData));
    }

    // Method to check if user can access specific feature
    canAccess(feature) {
        const userRole = this.getCurrentRole();
        
        const permissions = {
            student: ['view-courses', 'enroll-courses', 'create-groups', 'join-groups', 'view-tasks', 'complete-tasks'],
            teacher: ['create-courses', 'manage-courses', 'view-students', 'create-tasks', 'grade-tasks', 'upload-materials', 'view-analytics'],
            admin: ['create-courses', 'manage-courses', 'view-students', 'create-tasks', 'grade-tasks', 'upload-materials', 'view-analytics', 'manage-users']
        };

        return permissions[userRole] && permissions[userRole].includes(feature);
    }

    // Method to protect routes
    protectRoute(requiredRole = null) {
        if (!this.isAuthenticated()) {
            window.location.href = '/secondary.html/login/login.html';
            return false;
        }

        if (requiredRole && !this.hasRole(requiredRole)) {
            this.showAccessDenied();
            return false;
        }

        return true;
    }

    showAccessDenied() {
        const accessDeniedHtml = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                color: white;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            ">
                <div style="
                    background: rgba(48, 48, 48, 0.95);
                    padding: 40px;
                    border-radius: 15px;
                    text-align: center;
                    max-width: 400px;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                ">
                    <div style="font-size: 48px; margin-bottom: 20px; color: #dc3545;">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h2 style="margin-bottom: 15px;">Ruxsat etilmagan</h2>
                    <p style="margin-bottom: 20px; color: rgba(255, 255, 255, 0.8);">
                        Ushbu sahifaga kirish uchun ruxsat etishingiz yo'q.
                    </p>
                    <button onclick="window.location.href='/secondary.html/login/login.html'" style="
                        background: linear-gradient(90deg, #0d6efd, #00d4ff);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-size: 16px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                    ">
                        Kirish sahifasiga qaytish
                    </button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', accessDeniedHtml);
    }

    // Method to show role-based navigation
    setupRoleBasedNavigation() {
        const userRole = this.getCurrentRole();
        const navigation = document.querySelector('.navigation, .sidebar, .nav-menu');
        
        if (!navigation) return;

        // Hide/show navigation items based on role
        const navItems = navigation.querySelectorAll('[data-role-required]');
        navItems.forEach(item => {
            const requiredRoles = item.dataset.roleRequired.split(',');
            const hasAccess = requiredRoles.some(role => this.hasRole(role.trim()));
            
            if (hasAccess) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // Method to add role-based UI elements
    addRoleBasedUI() {
        const userRole = this.getCurrentRole();
        const user = this.getCurrentUser();
        
        // Add user info to header if element exists
        const userInfoElements = document.querySelectorAll('.user-info-header, .current-user, .user-avatar-header');
        userInfoElements.forEach(element => {
            if (userRole === 'teacher') {
                element.innerHTML = `
                    <div class="teacher-info">
                        <img src="${user.avatar || 'https://picsum.photos/seed/teacher-' + user.id + '/40/40'}" alt="Teacher" class="user-avatar">
                        <div class="user-details">
                            <div class="user-name">${user.full_name}</div>
                            <div class="user-role">O'qituvchi</div>
                        </div>
                    </div>
                `;
            } else {
                element.innerHTML = `
                    <div class="student-info">
                        <img src="${user.avatar || 'https://picsum.photos/seed/student-' + user.id + '/40/40'}" alt="Student" class="user-avatar">
                        <div class="user-details">
                            <div class="user-name">${user.full_name}</div>
                            <div class="user-role">O'quvchi</div>
                        </div>
                    </div>
                `;
            }
        });
    }

    // Method to handle API errors with role-based messages
    handleApiError(error, context = '') {
        const userRole = this.getCurrentRole();
        
        let message = 'Xatolik yuz berdi';
        
        if (error.status === 401) {
            message = 'Avtorizatsiya talab qilinadi. Iltimos, qayta kirishingiz.';
        } else if (error.status === 403) {
            if (userRole === 'student') {
                message = 'Ushbu amalni bajarish uchun o\'quvchi huquqlari talab qilinadi.';
            } else if (userRole === 'teacher') {
                message = 'Ushbu amalni bajarish uchun o\'qituvchi huquqlari talab qilinadi.';
            }
        } else if (error.status === 404) {
            message = 'So\'ralgan ma\'lumot topilmadi.';
        }

        // Show error notification
        this.showNotification(message, 'error');
    }

    // Method to show notifications
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
        `;

        notification.innerHTML += `
            <style>
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#0d6efd'};
                    color: white;
                    padding: 15px 20px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    z-index: 10000;
                    animation: slideIn 0.3s ease;
                    max-width: 400px;
                }
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            </style>
        `;

        document.body.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
}

// Initialize auth handler when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authHandler = new AuthHandler();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthHandler;
}
