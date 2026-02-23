// Dashboard JavaScript with API integration
class Dashboard {
    constructor() {
        this.currentUser = null;
        this.dashboardData = null;
        this.init();
    }

    async init() {
        // Check if user is authenticated
        try {
            await api.verifyToken();
            await this.loadCurrentUser();
            await this.loadDashboardData();
            this.setupEventListeners();
            this.renderDashboard();
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            window.location.href = '/secondary.html/login/login.html';
        }
    }

    async loadCurrentUser() {
        try {
            const profileData = await api.getProfile();
            this.currentUser = profileData.user;
        } catch (error) {
            console.error('Error loading current user:', error);
            throw error;
        }
    }

    async loadDashboardData() {
        try {
            const userId = this.currentUser.id;
            const [stats, activity, recommendations] = await Promise.all([
                api.getDashboardStats(userId),
                api.getRecentActivity(userId, 5),
                api.getRecommendations(userId)
            ]);

            this.dashboardData = {
                stats,
                recentActivity: activity,
                recommendations
            };
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            throw error;
        }
    }

    setupEventListeners() {
        // Search functionality
        const searchBar = document.querySelector('.search-bar');
        if (searchBar) {
            searchBar.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    const searchTerm = searchBar.value.trim();
                    if (searchTerm) {
                        await this.performSearch(searchTerm);
                    }
                }
            });
        }

        // Quick action buttons
        document.querySelectorAll('.action-card').forEach(card => {
            card.addEventListener('click', async () => {
                const title = card.querySelector('.action-title').textContent;
                await this.handleQuickAction(title);
            });
        });

        // Notification bell
        const notificationBell = document.querySelector('.notification-bell');
        if (notificationBell) {
            notificationBell.addEventListener('click', () => {
                this.showNotifications();
            });
        }

        // User menu
        const userAvatar = document.querySelector('.user-avatar');
        if (userAvatar) {
            userAvatar.addEventListener('click', () => {
                this.showUserMenu();
            });
        }
    }

    renderDashboard() {
        this.renderHeader();
        this.renderStats();
        this.renderActivity();
        this.renderRecommendations();
    }

    renderHeader() {
        const userInfo = document.querySelector('.user-info');
        if (userInfo && this.currentUser) {
            userInfo.innerHTML = `
                <img src="${this.currentUser.avatar || 'https://picsum.photos/seed/dashboard-user/40/40'}" alt="User" class="user-avatar">
                <div>
                    <h3 class="mb-1">Xush kelibsiz, ${this.currentUser.full_name}!</h3>
                    <p class="mb-0 text-white-50">Bugungi o'rganishni boshlang</p>
                </div>
            `;
        }
    }

    renderStats() {
        const statsGrid = document.querySelector('.stats-grid');
        if (!statsGrid || !this.dashboardData.stats) return;

        const stats = this.dashboardData.stats;
        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-book-open"></i>
                </div>
                <div class="stat-number text-primary">${stats.courses.active}</div>
                <div class="stat-label">Faol kurslar</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${stats.courses.avg_progress}%"></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-tasks"></i>
                </div>
                <div class="stat-number text-warning">${stats.tasks.overdue}</div>
                <div class="stat-label">Muddati yaqin vazifalar</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 60%; background: linear-gradient(90deg, #ffc107, #ffdb4d);"></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-users"></i>
                </div>
                <div class="stat-number text-success">${stats.groups.active}</div>
                <div class="stat-label">Faol guruhlar</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 75%; background: linear-gradient(90deg, #28a745, #5cb85c);"></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-fire"></i>
                </div>
                <div class="stat-number text-danger">${stats.learning.current_streak}</div>
                <div class="stat-label">Ketma-ket kunlar</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 95%; background: linear-gradient(90deg, #dc3545, #ff6b6b);"></div>
                </div>
            </div>
        `;
    }

    renderActivity() {
        const activityList = document.querySelector('.activity-list');
        if (!activityList || !this.dashboardData.recentActivity) return;

        const activities = this.dashboardData.recentActivity;
        activityList.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon ${activity.type}">
                    <i class="fas ${activity.icon}"></i>
                </div>
                <div class="activity-details">
                    <div class="activity-title">${activity.title}</div>
                    <div class="activity-time">${this.formatTime(activity.timestamp)}</div>
                </div>
            </div>
        `).join('');
    }

    renderRecommendations() {
        // Update quick actions based on recommendations
        const recommendations = this.dashboardData.recommendations;
        if (!recommendations) return;

        // Add notification badge if there are overdue tasks
        if (recommendations.overdue_tasks && recommendations.overdue_tasks.length > 0) {
            const notificationBell = document.querySelector('.notification-bell');
            if (notificationBell) {
                notificationBell.innerHTML = `
                    <i class="fas fa-bell"></i>
                    <span class="notification-badge">${recommendations.overdue_tasks.length}</span>
                `;
            }
        }
    }

    async handleQuickAction(action) {
        try {
            switch (action) {
                case 'Yangi kurs':
                    window.location.href = '/secondary.html/dashboard/pages/courses.html';
                    break;
                case 'Guruh yaratish':
                    window.location.href = '/secondary.html/dashboard/pages/groups.html';
                    break;
                case 'Vazifa qo\'shish':
                    window.location.href = '/secondary.html/dashboard/pages/vazifalar.html';
                    break;
                case 'Statistika':
                    this.showDetailedStats();
                    break;
                default:
                    console.log('Unknown action:', action);
            }
        } catch (error) {
            console.error('Error handling quick action:', error);
            this.showNotification('Xatolik yuz berdi', 'error');
        }
    }

    async performSearch(searchTerm) {
        try {
            const [courses, groups] = await Promise.all([
                api.getCourses({ search: searchTerm }),
                api.getGroups()
            ]);

            // Redirect to search results page or show modal
            this.showSearchResults({ courses, groups, searchTerm });
        } catch (error) {
            console.error('Search error:', error);
            this.showNotification('Qidirishda xatolik yuz berdi', 'error');
        }
    }

    showSearchResults(results) {
        // Create modal or redirect to search page
        const modal = document.createElement('div');
        modal.className = 'search-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Qidirish natijalari: "${results.searchTerm}"</h3>
                    <button class="close-btn" onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="search-section">
                        <h4>Kurslar (${results.courses.length})</h4>
                        <div class="search-results">
                            ${results.courses.slice(0, 3).map(course => `
                                <div class="search-result-item" onclick="window.location.href='/secondary.html/dashboard/pages/courses.html?id=${course.id}'">
                                    <h5>${course.title}</h5>
                                    <p>${course.category}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="search-section">
                        <h4>Guruhlar (${results.groups.length})</h4>
                        <div class="search-results">
                            ${results.groups.slice(0, 3).map(group => `
                                <div class="search-result-item" onclick="window.location.href='/secondary.html/dashboard/pages/groups.html?id=${group.id}'">
                                    <h5>${group.name}</h5>
                                    <p>${group.member_count} a'zo</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add styles
        modal.innerHTML += `
            <style>
                .search-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .modal-content {
                    background: linear-gradient(180deg, #020617, #0a2540);
                    border-radius: 15px;
                    padding: 30px;
                    max-width: 800px;
                    max-height: 80vh;
                    overflow-y: auto;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                .close-btn {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 20px;
                    cursor: pointer;
                }
                .search-section {
                    margin-bottom: 30px;
                }
                .search-results {
                    display: grid;
                    gap: 15px;
                    margin-top: 15px;
                }
                .search-result-item {
                    background: rgba(48, 48, 48, 0.81);
                    padding: 15px;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                .search-result-item:hover {
                    transform: translateY(-2px);
                    border-color: #0d6efd;
                }
            </style>
        `;

        document.body.appendChild(modal);
    }

    async showDetailedStats() {
        try {
            const progressData = await api.getLearningProgress(this.currentUser.id, 30);
            this.createStatsModal(progressData);
        } catch (error) {
            console.error('Error loading detailed stats:', error);
            this.showNotification('Statistikani yuklashda xatolik', 'error');
        }
    }

    createStatsModal(progressData) {
        const modal = document.createElement('div');
        modal.className = 'stats-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Batafsil statistika</h3>
                    <button class="close-btn" onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <canvas id="progressChart"></canvas>
                </div>
            </div>
        `;

        // Add styles
        modal.innerHTML += `
            <style>
                .stats-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .modal-content {
                    background: linear-gradient(180deg, #020617, #0a2540);
                    border-radius: 15px;
                    padding: 30px;
                    max-width: 600px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                #progressChart {
                    max-height: 400px;
                }
            </style>
        `;

        document.body.appendChild(modal);

        // Create simple chart (you could integrate Chart.js here)
        this.createSimpleChart(progressData);
    }

    createSimpleChart(data) {
        const canvas = document.getElementById('progressChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width = 500;
        const height = canvas.height = 300;

        // Simple bar chart
        ctx.fillStyle = '#0d6efd';
        const barWidth = width / (data.length * 2);
        const maxValue = Math.max(...data.map(d => d.courses_enrolled));

        data.forEach((item, index) => {
            const barHeight = (item.courses_enrolled / maxValue) * (height - 40);
            const x = (index * 2 + 0.5) * barWidth;
            const y = height - barHeight - 20;

            ctx.fillRect(x, y, barWidth, barHeight);
            
            // Draw date label
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(item.date, x + barWidth / 2, height - 5);
        });
    }

    showNotifications() {
        // Create notifications modal
        const modal = document.createElement('div');
        modal.className = 'notifications-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Bildirishnomalar</h3>
                    <button class="close-btn" onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="notification-item">
                        <i class="fas fa-clock"></i>
                        <span>2 ta vazifa muddati yaqinlashmoqda</span>
                    </div>
                    <div class="notification-item">
                        <i class="fas fa-trophy"></i>
                        <span>"Kod ustasi" yutuqini oldingiz</span>
                    </div>
                    <div class="notification-item">
                        <i class="fas fa-users"></i>
                        <span>"Alpha Developers" jamoasiga taklifnoma</span>
                    </div>
                </div>
            </div>
        `;

        // Add styles
        modal.innerHTML += `
            <style>
                .notifications-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .notification-item {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    padding: 15px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                .notification-item i {
                    color: #0d6efd;
                    width: 20px;
                }
            </style>
        `;

        document.body.appendChild(modal);
    }

    showUserMenu() {
        // Create user menu dropdown
        const existingMenu = document.querySelector('.user-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        const menu = document.createElement('div');
        menu.className = 'user-menu';
        menu.innerHTML = `
            <div class="user-menu-item" onclick="window.location.href='/secondary.html/dashboard/pages/profile.html'">
                <i class="fas fa-user"></i> Profil
            </div>
            <div class="user-menu-item" onclick="window.location.href='/secondary.html/dashboard/pages/settings.html'">
                <i class="fas fa-cog"></i> Sozlamalar
            </div>
            <div class="user-menu-item" onclick="dashboard.logout()">
                <i class="fas fa-sign-out-alt"></i> Chiqish
            </div>
        `;

        // Add styles
        menu.innerHTML += `
            <style>
                .user-menu {
                    position: absolute;
                    top: 60px;
                    right: 20px;
                    background: linear-gradient(180deg, #020617, #0a2540);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    padding: 10px 0;
                    min-width: 150px;
                    z-index: 1000;
                }
                .user-menu-item {
                    padding: 10px 20px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    transition: background 0.3s ease;
                }
                .user-menu-item:hover {
                    background: rgba(13, 110, 253, 0.2);
                }
            </style>
        `;

        document.body.appendChild(menu);

        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', () => {
                if (document.querySelector('.user-menu')) {
                    document.querySelector('.user-menu').remove();
                }
            }, { once: true });
        }, 100);
    }

    async logout() {
        try {
            await api.logout();
            window.location.href = '/secondary.html/login/login.html';
        } catch (error) {
            console.error('Logout error:', error);
            window.location.href = '/secondary.html/login/login.html';
        }
    }

    showNotification(message, type = 'info') {
        // Create notification toast
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
        `;

        // Add styles
        notification.innerHTML += `
            <style>
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: ${type === 'error' ? '#dc3545' : '#0d6efd'};
                    color: white;
                    padding: 15px 20px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    z-index: 10000;
                    animation: slideIn 0.3s ease;
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
            notification.remove();
        }, 5000);
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) {
            return 'Hozirgina';
        } else if (diffMins < 60) {
            return `${diffMins} daqiqa oldin`;
        } else if (diffHours < 24) {
            return `${diffHours} soat oldin`;
        } else if (diffDays < 7) {
            return `${diffDays} kun oldin`;
        } else {
            return date.toLocaleDateString('uz-UZ');
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new Dashboard();
});
