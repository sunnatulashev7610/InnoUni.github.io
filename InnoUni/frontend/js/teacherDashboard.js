// Teacher Dashboard JavaScript
class TeacherDashboard {
    constructor() {
        this.currentUser = null;
        this.dashboardData = null;
        this.init();
    }

    async init() {
        try {
            await api.verifyToken();
            await this.loadCurrentUser();
            await this.loadTeacherDashboardData();
            this.setupEventListeners();
            this.renderTeacherDashboard();
        } catch (error) {
            console.error('Teacher dashboard initialization error:', error);
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

    async loadTeacherDashboardData() {
        try {
            const userId = this.currentUser.id;
            const dashboardData = await api.request(`/teacher/dashboard/${userId}`);
            this.dashboardData = dashboardData;
        } catch (error) {
            console.error('Error loading teacher dashboard data:', error);
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
                        await this.performTeacherSearch(searchTerm);
                    }
                }
            });
        }

        // Course cards
        document.querySelectorAll('.course-card').forEach(card => {
            card.addEventListener('click', async () => {
                const courseId = card.dataset.courseId;
                await this.viewCourseManagement(courseId);
            });
        });

        // Create course button
        const createCourseBtn = document.querySelector('.create-course-btn');
        if (createCourseBtn) {
            createCourseBtn.addEventListener('click', async () => {
                await this.showCreateCourseModal();
            });
        }

        // Quick action buttons
        document.querySelectorAll('.quick-action-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                await this.handleQuickAction(action);
            });
        });

        // Student list actions
        document.querySelectorAll('.student-action-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                const studentId = btn.dataset.studentId;
                await this.handleStudentAction(action, studentId);
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

        // Analytics tabs
        document.querySelectorAll('.analytics-tab').forEach(tab => {
            tab.addEventListener('click', async () => {
                const period = tab.dataset.period;
                await this.loadAnalytics(period);
            });
        });
    }

    renderTeacherDashboard() {
        this.renderTeacherHeader();
        this.renderTeacherStats();
        this.renderCoursesOverview();
        this.renderRecentActivities();
        this.renderQuickActions();
    }

    renderTeacherHeader() {
        const userInfo = document.querySelector('.user-info');
        if (userInfo && this.currentUser) {
            userInfo.innerHTML = `
                <img src="${this.currentUser.avatar || 'https://picsum.photos/seed/teacher-avatar/40/40'}" alt="User" class="user-avatar">
                <div>
                    <h3 class="mb-1">Xush kelibsiz, ${this.currentUser.full_name}!</h3>
                    <p class="mb-0 text-white-50">O'qituvchi boshqaruv paneli</p>
                </div>
            `;
        }
    }

    renderTeacherStats() {
        const statsGrid = document.querySelector('.stats-grid');
        if (!statsGrid || !this.dashboardData.stats) return;

        const stats = this.dashboardData.stats;
        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-book-open"></i>
                </div>
                <div class="stat-number text-primary">${stats.total_courses}</div>
                <div class="stat-label">Jami kurslar</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 100%"></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-users"></i>
                </div>
                <div class="stat-number text-success">${stats.total_students}</div>
                <div class="stat-label">Jami talabalar</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 75%; background: linear-gradient(90deg, #28a745, #5cb85c);"></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-graduation-cap"></i>
                </div>
                <div class="stat-number text-warning">${stats.total_completions}</div>
                <div class="stat-label">Tugatilganlar</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.round(stats.avg_course_progress)}%; background: linear-gradient(90deg, #ffc107, #ffdb4d);"></div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">
                    <i class="fas fa-tasks"></i>
                </div>
                <div class="stat-number text-info">${stats.total_tasks_completed}</div>
                <div class="stat-label">Bajarilgan vazifalar</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.round((stats.total_tasks_completed / stats.total_tasks_assigned) * 100)}%; background: linear-gradient(90deg, #17a2b8, #5bc0de);"></div>
                </div>
            </div>
        `;
    }

    renderCoursesOverview() {
        const coursesContainer = document.querySelector('.courses-container');
        if (!coursesContainer || !this.dashboardData.courses) return;

        const courses = this.dashboardData.courses;
        coursesContainer.innerHTML = `
            <div class="courses-header">
                <h3>Kurslarim</h3>
                <button class="create-course-btn">
                    <i class="fas fa-plus me-2"></i>Yangi kurs yaratish
                </button>
            </div>
            <div class="courses-grid">
                ${courses.map(course => `
                    <div class="course-card" data-course-id="${course.id}">
                        <div class="course-header">
                            <img src="${course.avatar || 'https://picsum.photos/seed/course-' + course.id + '/60/60'}" alt="${course.title}" class="course-avatar">
                            <div class="course-info">
                                <h4>${course.title}</h4>
                                <div class="course-meta">
                                    <span class="course-category">${course.category}</span>
                                    <span class="course-status ${course.status}">${this.getStatusLabel(course.status)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="course-stats">
                            <div class="stat-item">
                                <span class="stat-number">${course.enrolled_students}</span>
                                <span class="stat-label">Yozilgan talabalar</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number">${course.completed_students}</span>
                                <span class="stat-label">Tugatilganlar</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number">${Math.round(course.avg_progress)}%</span>
                                <span class="stat-label">O'rtacha progress</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number">${course.new_enrollments_this_week}</span>
                                <span class="stat-label">Bu hafta yozilganlar</span>
                            </div>
                        </div>
                        </div>
                        <div class="course-actions">
                            <button class="action-btn btn-view" data-action="view" data-course-id="${course.id}">
                                <i class="fas fa-eye me-1"></i>Talabalar
                            </button>
                            <button class="action-btn btn-primary" data-action="manage" data-course-id="${course.id}">
                                <i class="fas fa-cog me-1"></i>Boshqarish
                            </button>
                            <button class="action-btn btn-success" data-action="analytics" data-course-id="${course.id}">
                                <i class="fas fa-chart-line me-1"></i>Analitika
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderRecentActivities() {
        const activityContainer = document.querySelector('.activity-container');
        if (!activityContainer || !this.dashboardData.recentActivities) return;

        const activities = this.dashboardData.recentActivities;
        activityContainer.innerHTML = `
            <h3>So'nggi faoliyat</h3>
            <div class="activity-list">
                ${activities.map(activity => `
                    <div class="activity-item">
                        <div class="activity-icon ${activity.activity_type}">
                            <i class="fas ${this.getActivityIcon(activity.activity_type)}"></i>
                        </div>
                        <div class="activity-details">
                            <div class="activity-title">
                                ${activity.student_name} ${this.getActivityLabel(activity.activity_type)} "${activity.course_title}"
                            </div>
                            <div class="activity-time">${this.formatDate(activity.timestamp)}</div>
                            ${activity.student_progress ? `
                                <div class="activity-progress">
                                    <span>Progress: ${Math.round(activity.student_progress)}%</span>
                                    <div class="progress-bar">
                                        <div class="progress-fill" style="width: ${activity.student_progress}%"></div>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderQuickActions() {
        const actionsContainer = document.querySelector('.quick-actions-container');
        if (!actionsContainer) return;

        actionsContainer.innerHTML = `
            <div class="quick-actions-grid">
                <div class="quick-action-card" data-action="create-course">
                    <div class="action-icon">
                        <i class="fas fa-plus-circle"></i>
                    </div>
                    <h4>Yangi kurs</h4>
                    <p>Yangi kurs yarating</p>
                </div>
                <div class="quick-action-card" data-action="manage-tasks">
                    <div class="action-icon">
                        <i class="fas fa-tasks"></i>
                    </div>
                    <h4>Vazifalar</h4>
                    <p>Vazifalarni boshqaring</p>
                </div>
                <div class="quick-action-card" data-action="view-analytics">
                    <div class="action-icon">
                        <i class="fas fa-chart-bar"></i>
                    </div>
                    <h4>Analitika</h4>
                    <p>Batafsil statistikani ko'rish</p>
                </div>
                <div class="quick-action-card" data-action="library">
                    <div class="action-icon">
                        <i class="fas fa-folder-open"></i>
                    </div>
                    <h4>Kutubxona</h4>
                    <p>Materlallarni boshqarish</p>
                </div>
            </div>
        `;
    }

    async handleQuickAction(action) {
        try {
            switch (action) {
                case 'create-course':
                    await this.showCreateCourseModal();
                    break;
                case 'manage-tasks':
                    window.location.href = '/secondary.html/dashboard/pages/vazifalar.html';
                    break;
                case 'view-analytics':
                    await this.showAnalyticsModal();
                    break;
                case 'library':
                    await this.showLibraryModal();
                    break;
                default:
                    console.log('Unknown quick action:', action);
            }
        } catch (error) {
            console.error('Quick action error:', error);
            this.showNotification('Xatolik yuz berdi', 'error');
        }
    }

    async handleStudentAction(action, studentId) {
        try {
            switch (action) {
                case 'view-progress':
                    await this.viewStudentProgress(studentId);
                    break;
                case 'send-message':
                    await this.showSendMessageModal(studentId);
                    break;
                case 'grade-assignments':
                    await this.viewStudentAssignments(studentId);
                    break;
                default:
                    console.log('Unknown student action:', action);
            }
        } catch (error) {
            console.error('Student action error:', error);
            this.showNotification('Xatolik yuz berdi', 'error');
        }
    }

    async handleTaskAction(action, taskId) {
        try {
            switch (action) {
                case 'view':
                    await this.viewTaskDetails(taskId);
                    break;
                case 'edit':
                    await this.editTask(taskId);
                    break;
                case 'grade':
                    await this.gradeTask(taskId);
                    break;
                case 'delete':
                    await this.deleteTask(taskId);
                    break;
                default:
                    console.log('Unknown task action:', action);
            }
        } catch (error) {
            console.error('Task action error:', error);
            this.showNotification('Xatolik yuz berdi', 'error');
        }
    }

    async showCreateCourseModal() {
        const modal = document.createElement('div');
        modal.className = 'create-course-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Yangi kurs yaratish</h3>
                    <button class="close-btn" onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="create-course-form">
                        <div class="form-group">
                            <label for="course-title">Kurs nomi</label>
                            <input type="text" id="course-title" name="title" required>
                        </div>
                        <div class="form-group">
                            <label for="course-category">Kategoriya</label>
                            <select id="course-category" name="category" required>
                                <option value="">Kategoriya tanlang</option>
                                <option value="Web dasturlash">Web dasturlash</option>
                                <option value="Backend dasturlash">Backend dasturlash</option>
                                <option value="Mobile dev">Mobile dasturlash</option>
                                <option value="Dizayn">Dizayn</option>
                                <option value="Ma'lumotlar tahlili">Ma'lumotlar tahlili</option>
                                <option value="Matematika">Matematika</option>
                                <option value="Ingliz tili">Ingliz tili</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="course-description">Tavsif</label>
                            <textarea id="course-description" name="description" rows="4" required></textarea>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn-cancel" onclick="this.closest('.modal').remove()">Bekor qilish</button>
                            <button type="submit" class="btn-primary">Yaratish</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Handle form submission
        const form = document.getElementById('create-course-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.createCourse(form);
        });
    }

    async createCourse(form) {
        try {
            const formData = new FormData(form);
            const courseData = {
                title: formData.get('title'),
                category: formData.get('category'),
                description: formData.get('description')
            };

            await api.createCourse(courseData);
            this.showNotification('Kurs muvaffaqiyatli yaratildi!', 'success');
            document.querySelector('.modal').remove();
            await this.loadTeacherDashboardData();
            this.renderCoursesOverview();
        } catch (error) {
            console.error('Course creation error:', error);
            this.showNotification('Kurs yaratishda xatolik', 'error');
        }
    }

    async viewCourseManagement(courseId) {
        try {
            const course = await api.getCourse(courseId);
            this.showCourseManagementModal(course);
        } catch (error) {
            console.error('View course management error:', error);
            this.showNotification('Kurs ma\'lumotlarini yuklashda xatolik', 'error');
        }
    }

    showCourseManagementModal(course) {
        const modal = document.createElement('div');
        modal.className = 'course-management-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${course.title}</h3>
                    <button class="close-btn" onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="course-stats">
                        <div class="stat-item">
                            <span class="stat-number">${course.enrolled_students}</span>
                            <span class="stat-label">Yozilgan talabalar</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number">${course.completed_students}</span>
                            <span class="stat-label">Tugatilganlar</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-number">${Math.round(course.avg_progress)}%</span>
                            <span class="stat-label">O\'rtacha progress</span>
                        </div>
                    </div>
                    <div class="action-buttons">
                        <button class="action-btn btn-primary" onclick="teacherDashboard.viewStudents(${course.id})">
                            <i class="fas fa-users me-1"></i>Talabalar
                        </button>
                        <button class="action-btn btn-success" onclick="teacherDashboard.manageTasks(${course.id})">
                            <i class="fas fa-tasks me-1"></i>Vazifalar
                        </button>
                        <button class="action-btn btn-info" onclick="teacherDashboard.viewAnalytics(${course.id})">
                            <i class="fas fa-chart-line me-1"></i>Analitika
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    async viewStudents(courseId) {
        try {
            const students = await api.request(`/teacher/courses/${courseId}/students`);
            this.showStudentsModal(students, courseId);
        } catch (error) {
            console.error('View students error:', error);
            this.showNotification('Talabalar ro\'yxatini yuklashda xatolik', 'error');
        }
    }

    showStudentsModal(students, courseId) {
        const modal = document.createElement('div');
        modal.className = 'students-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Kurs talabalari</h3>
                    <button class="close-btn" onclick="this.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="students-list">
                        ${students.map(student => `
                            <div class="student-item">
                                <div class="student-info">
                                    <img src="${student.avatar || 'https://picsum.photos/seed/student-' + student.id + '/40/40'}" alt="${student.full_name}" class="student-avatar">
                                    <div class="student-details">
                                        <h4>${student.full_name}</h4>
                                        <p>${student.email}</p>
                                        <p>${student.phone}</p>
                                    </div>
                                </div>
                                <div class="student-progress">
                                    <div class="progress-info">
                                        <span>Progress: ${Math.round(student.progress)}%</span>
                                        <div class="progress-bar">
                                            <div class="progress-fill" style="width: ${student.progress}%"></div>
                                        </div>
                                    </div>
                                    <div class="student-stats">
                                        <div class="stat-item">
                                            <span class="stat-number">${student.completed_tasks}</span>
                                            <span class="stat-label">Bajarilgan vazifalar</span>
                                        </div>
                                        <div class="stat-item">
                                            <span class="stat-number">${student.overdue_tasks}</span>
                                            <span class="stat-label">Muddati o'tgan</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="student-actions">
                                    <button class="student-action-btn" data-action="view-progress" data-student-id="${student.id}">
                                        <i class="fas fa-chart-line me-1"></i>Progress
                                    </button>
                                    <button class="student-action-btn" data-action="send-message" data-student-id="${student.id}">
                                        <i class="fas fa-envelope me-1"></i>Xabar yuborish
                                    </button>
                                    <button class="student-action-btn" data-action="grade-assignments" data-student-id="${student.id}">
                                        <i class="fas fa-graduation-cap me-1"></i>Baholash
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    getStatusLabel(status) {
        const labels = {
            'active': 'Faol',
            'inactive': 'Faol emas'
        };
        return labels[status] || status;
    }

    getActivityIcon(type) {
        const icons = {
            'enrollment': 'fa-user-plus',
            'task_completion': 'fa-check-circle',
            'course_completion': 'fa-graduation-cap'
        };
        return icons[type] || 'fa-info-circle';
    }

    getActivityLabel(type) {
        const labels = {
            'enrollment': 'yozildi',
            'task_completion': 'bajarildi',
            'course_completion': 'tugatdi'
        };
        return labels[type] || 'amalga o\'tdi';
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

// Initialize teacher dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.teacherDashboard = new TeacherDashboard();
});
