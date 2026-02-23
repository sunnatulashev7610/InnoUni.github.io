// Student Dashboard JavaScript
class StudentDashboard {
    constructor() {
        this.currentUser = null;
        this.dashboardData = null;
        this.init();
    }

    async init() {
        try {
            await api.verifyToken();
            await this.loadCurrentUser();
            await this.loadStudentDashboardData();
            this.setupEventListeners();
            this.renderStudentDashboard();
        } catch (error) {
            console.error('Student dashboard initialization error:', error);
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

    async loadStudentDashboardData() {
        try {
            const userId = this.currentUser.id;
            const [dashboardData, recommendations] = await Promise.all([
                api.request(`/student/dashboard/${userId}`),
                api.request(`/student/recommendations/${userId}`)
            ]);

            this.dashboardData = dashboardData;
            this.recommendations = recommendations;
        } catch (error) {
            console.error('Error loading student dashboard data:', error);
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
                        await this.performStudentSearch(searchTerm);
                    }
                }
            });
        }

        // Course cards
        document.querySelectorAll('.course-card').forEach(card => {
            card.addEventListener('click', async () => {
                const courseId = card.dataset.courseId;
                await this.viewCourseDetails(courseId);
            });
        });

        // Group cards
        document.querySelectorAll('.group-card').forEach(card => {
            card.addEventListener('click', async () => {
                const groupId = card.dataset.groupId;
                await this.viewGroupDetails(groupId);
            });
        });

        // Task actions
        document.querySelectorAll('.task-action-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                const taskId = btn.dataset.taskId;
                await this.handleTaskAction(action, taskId);
            });
        });

        // Quick action buttons
        document.querySelectorAll('.quick-action-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                await this.handleQuickAction(action);
            });
        });

        // Enrollment buttons
        document.querySelectorAll('.enroll-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const courseId = btn.dataset.courseId;
                await this.enrollInCourse(courseId);
            });
        });

        // Join group buttons
        document.querySelectorAll('.join-group-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const groupId = btn.dataset.groupId;
                await this.joinGroup(groupId);
            });
        });
    }

    renderStudentDashboard() {
        this.renderStudentHeader();
        this.renderStudentStats();
        this.renderEnrolledCourses();
        this.renderStudentGroups();
        this.renderStudentTasks();
        this.renderStudentAchievements();
        this.renderRecommendations();
    }

    renderStudentHeader() {
        const userInfo = document.querySelector('.user-info');
        if (userInfo && this.currentUser) {
            userInfo.innerHTML = `
                <img src="${this.currentUser.avatar || 'https://picsum.photos/seed/student-avatar/40/40'}" alt="User" class="user-avatar">
                <div>
                    <h3 class="mb-1">Xush kelibsiz, ${this.currentUser.full_name}!</h3>
                    <p class="mb-0 text-white-50">O'rganishni davom ettiring</p>
                </div>
            `;
        }
    }

    renderStudentStats() {
        const statsGrid = document.querySelector('.stats-grid');
        if (!statsGrid || !this.dashboardData.stats) return;

        const stats = this.dashboardData.stats;
        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-book-open"></i>
                </div>
                <div class="stat-number text-primary">${stats.enrolled_courses}</div>
                <div class="stat-label">Yozilgan kurslar</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${stats.avg_progress}%"></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-tasks"></i>
                </div>
                <div class="stat-number text-warning">${stats.overdue_tasks}</div>
                <div class="stat-label">Muddati o'tgan vazifalar</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 60%; background: linear-gradient(90deg, #ffc107, #ffdb4d);"></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-users"></i>
                </div>
                <div class="stat-number text-success">${stats.active_groups}</div>
                <div class="stat-label">Faol guruhlar</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 75%; background: linear-gradient(90deg, #28a745, #5cb85c);"></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-fire"></i>
                </div>
                <div class="stat-number text-danger">${stats.current_streak}</div>
                <div class="stat-label">Ketma-ket kunlar</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 95%; background: linear-gradient(90deg, #dc3545, #ff6b6b);"></div>
                </div>
            </div>
        `;
    }

    renderEnrolledCourses() {
        const coursesContainer = document.querySelector('.courses-container');
        if (!coursesContainer || !this.dashboardData.courses) return;

        const courses = this.dashboardData.courses;
        coursesContainer.innerHTML = courses.map(course => `
            <div class="course-card" data-course-id="${course.id}">
                <div class="course-header">
                    <img src="${course.avatar || 'https://picsum.photos/seed/course-' + course.id + '/60/60'}" alt="${course.title}" class="course-avatar">
                    <div class="course-info">
                        <h4>${course.title}</h4>
                        <div class="course-meta">
                            <span class="course-category">${course.category}</span>
                            <span class="course-teacher">${course.teacher_name}</span>
                        </div>
                    </div>
                </div>
                <div class="course-progress">
                    <div class="progress-info">
                        <span>Progress: ${Math.round(course.progress)}%</span>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${course.progress}%"></div>
                        </div>
                    </div>
                    <div class="course-stats">
                        <div class="stat-item">
                            <span class="stat-number">${course.pending_tasks}</span>
                            <span class="stat-label">Kutilmoqda</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number">${course.overdue_tasks}</span>
                            <span class="stat-label">Muddati o'tgan</span>
                        </div>
                    </div>
                </div>
                <div class="course-actions">
                    <button class="action-btn btn-view" data-action="view" data-course-id="${course.id}">
                        <i class="fas fa-eye me-1"></i>Ko'rish
                    </button>
                    <button class="action-btn btn-primary" data-action="continue" data-course-id="${course.id}">
                        <i class="fas fa-play me-1"></i>Davom ettirish
                    </button>
                </div>
            </div>
        `).join('');
    }

    renderStudentGroups() {
        const groupsContainer = document.querySelector('.groups-container');
        if (!groupsContainer || !this.dashboardData.groups) return;

        const groups = this.dashboardData.groups;
        groupsContainer.innerHTML = groups.map(group => `
            <div class="group-card" data-group-id="${group.id}">
                <div class="group-header">
                    <img src="${group.logo || 'https://picsum.photos/seed/group-' + group.id + '/60/60'}" alt="${group.name}" class="group-avatar">
                    <div class="group-info">
                        <h4>${group.name}</h4>
                        <div class="group-meta">
                            <span class="group-role">${group.student_role === 'leader' ? 'Rahbar' : 'A'zo'}</span>
                            <span class="member-count">${group.total_members} a'zo</span>
                        </div>
                    </div>
                </div>
                <div class="group-description">${group.description}</div>
                <div class="group-stats">
                    <div class="stat-item">
                        <span class="stat-number">${group.active_projects}</span>
                        <span class="stat-label">Faol loyihalar</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-number">${group.joined_at ? this.formatDate(group.joined_at) : 'N/A'}</span>
                        <span class="stat-label">Qo'shilgan sana</span>
                    </div>
                </div>
                <div class="group-actions">
                    <button class="action-btn btn-view" data-action="view" data-group-id="${group.id}">
                        <i class="fas fa-eye me-1"></i>Ko'rish
                    </button>
                    <button class="action-btn btn-success" data-action="manage" data-group-id="${group.id}">
                        <i class="fas fa-cog me-1"></i>Boshqarish
                    </button>
                </div>
            </div>
        `).join('');
    }

    renderStudentTasks() {
        const tasksContainer = document.querySelector('.tasks-container');
        if (!tasksContainer || !this.dashboardData.tasks) return;

        const tasks = this.dashboardData.tasks;
        tasksContainer.innerHTML = tasks.map(task => `
            <div class="task-card priority-${task.priority}">
                <div class="task-header">
                    <h4>${task.title}</h4>
                    <div class="task-meta">
                        <span class="task-priority">${this.getPriorityLabel(task.priority)}</span>
                        <span class="task-course">${task.course_title}</span>
                        <span class="task-due-date ${this.isOverdue(task.due_date) ? 'overdue' : ''}">
                            <i class="far fa-calendar"></i>
                            ${this.formatDate(task.due_date)}
                        </span>
                    </div>
                </div>
                <div class="task-description">${task.description}</div>
                <div class="task-actions">
                    <button class="task-action-btn btn-view" data-action="view" data-task-id="${task.id}">
                        <i class="fas fa-eye me-1"></i>Tafsilot
                    </button>
                    ${task.status === 'completed' ? 
                        `<button class="task-action-btn btn-success" disabled>
                            <i class="fas fa-check me-1"></i>Bajarilgan
                        </button>` :
                        `<button class="task-action-btn btn-primary" data-action="complete" data-task-id="${task.id}">
                            <i class="fas fa-play me-1"></i>Bajarish
                        </button>`
                    }
                </div>
            </div>
        `).join('');
    }

    renderStudentAchievements() {
        const achievementsContainer = document.querySelector('.achievements-container');
        if (!achievementsContainer || !this.dashboardData.achievements) return;

        const achievements = this.dashboardData.achievements;
        achievementsContainer.innerHTML = achievements.map(achievement => `
            <div class="achievement-item">
                <div class="achievement-icon">
                    <i class="fas ${achievement.icon}"></i>
                </div>
                <div class="achievement-details">
                    <h5>${achievement.title}</h5>
                    <p>${achievement.description}</p>
                    <div class="achievement-date">
                        <i class="far fa-calendar-check"></i>
                        ${this.formatDate(achievement.earned_at)}
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderRecommendations() {
        const recommendationsContainer = document.querySelector('.recommendations-container');
        if (!recommendationsContainer || !this.recommendations) return;

        const recs = this.recommendations;
        recommendationsContainer.innerHTML = `
            <div class="recommendations-section">
                <h3>Tavsiya etilgan kurslar</h3>
                <div class="recommended-courses">
                    ${recs.recommended_courses.map(course => `
                        <div class="recommended-course">
                            <h4>${course.title}</h4>
                            <p>${course.category} - ${course.teacher_name}</p>
                            <button class="enroll-btn" data-course-id="${course.id}">
                                <i class="fas fa-plus me-1"></i>Yozilish
                            </button>
                        </div>
                    `).join('')}
                </div>
                <h3>Qo'shilishi mumkin bo'lgan guruhlar</h3>
                <div class="available-groups">
                    ${recs.available_groups.map(group => `
                        <div class="available-group">
                            <h4>${group.name}</h4>
                            <p>${group.current_members} a'zo</p>
                            <button class="join-group-btn" data-group-id="${group.id}">
                                <i class="fas fa-user-plus me-1"></i>Qo'shilish
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    async handleTaskAction(action, taskId) {
        try {
            switch (action) {
                case 'view':
                    await this.viewTaskDetails(taskId);
                    break;
                case 'complete':
                    await api.completeTask(taskId);
                    this.showNotification('Vazifa muvaffaqiyatli yakunlandi!', 'success');
                    await this.loadStudentDashboardData();
                    this.renderStudentTasks();
                    break;
                default:
                    console.log('Unknown task action:', action);
            }
        } catch (error) {
            console.error('Task action error:', error);
            this.showNotification('Xatolik yuz berdi', 'error');
        }
    }

    async handleQuickAction(action) {
        try {
            switch (action) {
                case 'browse-courses':
                    window.location.href = '/secondary.html/dashboard/pages/groups.html';
                    break;
                case 'join-group':
                    window.location.href = '/secondary.html/dashboard/pages/jamoalar.html';
                    break;
                case 'view-tasks':
                    window.location.href = '/secondary.html/dashboard/pages/vazifalar.html';
                    break;
                case 'view-profile':
                    window.location.href = '/secondary.html/dashboard/pages/profile.html';
                    break;
                default:
                    console.log('Unknown quick action:', action);
            }
        } catch (error) {
            console.error('Quick action error:', error);
            this.showNotification('Xatolik yuz berdi', 'error');
        }
    }

    async enrollInCourse(courseId) {
        try {
            await api.enrollInCourse(courseId);
            this.showNotification('Kursga muvaffaqiyatli yozildingiz!', 'success');
            await this.loadStudentDashboardData();
            this.renderStudentStats();
            this.renderEnrolledCourses();
        } catch (error) {
            console.error('Enrollment error:', error);
            this.showNotification('Yozilishda xatolik yuz berdi', 'error');
        }
    }

    async joinGroup(groupId) {
        try {
            await api.joinGroup(groupId);
            this.showNotification('Guruhga muvaffaqiyatli qo\'shildingiz!', 'success');
            await this.loadStudentDashboardData();
            this.renderStudentStats();
            this.renderStudentGroups();
        } catch (error) {
            console.error('Join group error:', error);
            this.showNotification('Qo\'shishda xatolik yuz berdi', 'error');
        }
    }

    async viewCourseDetails(courseId) {
        try {
            const course = await api.getCourse(courseId);
            this.showCourseModal(course);
        } catch (error) {
            console.error('View course error:', error);
            this.showNotification('Kurs ma\'lumotlarini yuklashda xatolik', 'error');
        }
    }

    async viewGroupDetails(groupId) {
        try {
            const group = await api.getGroup(groupId);
            this.showGroupModal(group);
        } catch (error) {
            console.error('View group error:', error);
            this.showNotification('Guruh ma\'lumotlarini yuklashda xatolik', 'error');
        }
    }

    async viewTaskDetails(taskId) {
        try {
            const task = await api.getTask(taskId);
            this.showTaskModal(task);
        } catch (error) {
            console.error('View task error:', error);
            this.showNotification('Vazifa ma\'lumotlarini yuklashda xatolik', 'error');
        }
    }

    async performStudentSearch(searchTerm) {
        try {
            const [courses, groups] = await Promise.all([
                api.getCourses({ search: searchTerm }),
                api.getGroups()
            ]);

            this.showSearchResults({ courses, groups, searchTerm });
        } catch (error) {
            console.error('Search error:', error);
            this.showNotification('Qidirishda xatolik yuz berdi', 'error');
        }
    }

    showCourseModal(course) {
        const modal = document.createElement('div');
        modal.className = 'course-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${course.title}</h3>
                    <button class="close-btn" onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="course-details">
                        <div class="detail-item">
                            <strong>Kategoriya:</strong> ${course.category}
                        </div>
                        <div class="detail-item">
                            <strong>O\'qituvchi:</strong> ${course.teacher_name}
                        </div>
                        <div class="detail-item">
                            <strong>Tavsif:</strong> ${course.description}
                        </div>
                        <div class="detail-item">
                            <strong>Yozilgan talabalar:</strong> ${course.enrolled_students}
                        </div>
                        <div class="detail-item">
                            <strong>O\'rtacha progress:</strong> ${Math.round(course.avg_progress)}%
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    showGroupModal(group) {
        const modal = document.createElement('div');
        modal.className = 'group-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${group.name}</h3>
                    <button class="close-btn" onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="group-details">
                        <div class="detail-item">
                            <strong>Tavsif:</strong> ${group.description}
                        </div>
                        <div class="detail-item">
                            <strong>A'zolar soni:</strong> ${group.total_members}
                        </div>
                        <div class="detail-item">
                            <strong>Faol loyihalar:</strong> ${group.active_projects}
                        </div>
                        <div class="detail-item">
                            <strong>Sizning rolingiz:</strong> ${group.student_role === 'leader' ? 'Rahbar' : 'A\'zo'}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    showTaskModal(task) {
        const modal = document.createElement('div');
        modal.className = 'task-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${task.title}</h3>
                    <button class="close-btn" onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="task-details">
                        <div class="detail-item">
                            <strong>Kurs:</strong> ${task.course_title}
                        </div>
                        <div class="detail-item">
                            <strong>Tavsif:</strong> ${task.description}
                        </div>
                        <div class="detail-item">
                            <strong>Ustunlik:</strong> ${this.getPriorityLabel(task.priority)}
                        </div>
                        <div class="detail-item">
                            <strong>Muddat:</strong> ${this.formatDate(task.due_date)}
                        </div>
                        <div class="detail-item">
                            <strong>Holat:</strong> ${this.getStatusLabel(task.status)}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    getPriorityLabel(priority) {
        const labels = {
            'low': 'Past',
            'medium': 'O\'rta',
            'high': 'Yuqori'
        };
        return labels[priority] || priority;
    }

    getStatusLabel(status) {
        const labels = {
            'pending': 'Kutilmoqda',
            'in_progress': 'Jarayonda',
            'completed': 'Bajarilgan'
        };
        return labels[status] || status;
    }

    isOverdue(dueDate) {
        return new Date(dueDate) < new Date();
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffDays === 0) {
            return 'Bugun';
        } else if (diffDays === 1) {
            return 'Kecha';
        } else if (diffDays < 7) {
            return `${diffDays} kun oldin`;
        } else {
            return date.toLocaleDateString('uz-UZ');
        }
    }

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

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Initialize student dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.studentDashboard = new StudentDashboard();
});
