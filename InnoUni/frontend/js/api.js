// API Client for O'QIV Platform
class ApiClient {
    constructor() {
        // Load configuration
        this.loadConfig();
        this.token = localStorage.getItem('token');
    }

    // Load configuration based on environment
    loadConfig() {
        if (window.config) {
            this.baseURL = window.config.apiBaseUrl;
        } else {
            // Fallback for backward compatibility
            this.baseURL = window.location.hostname === 'localhost' 
                ? 'http://localhost:3000/api' 
                : '/api';
        }
    }

    // Set authentication token
    setToken(token) {
        this.token = token;
        localStorage.setItem('token', token);
    }

    // Get authorization headers
    getAuthHeaders() {
        return this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
    }

    // Generic request method
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...this.getAuthHeaders(),
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    // Authentication methods
    async register(userData) {
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    }

    async login(credentials) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
        
        if (data.token) {
            this.setToken(data.token);
        }
        
        return data;
    }

    async logout() {
        localStorage.removeItem('token');
        this.token = null;
    }

    async getProfile() {
        return this.request('/auth/profile');
    }

    async updateProfile(profileData) {
        return this.request('/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
    }

    async changePassword(passwordData) {
        return this.request('/auth/password', {
            method: 'PUT',
            body: JSON.stringify(passwordData)
        });
    }

    // Dashboard methods
    async getDashboardStats(userId) {
        return this.request(`/dashboard/stats/${userId}`);
    }

    async getRecentActivity(userId, limit = 10) {
        return this.request(`/dashboard/activity/${userId}?limit=${limit}`);
    }

    async getLearningProgress(userId, days = 30) {
        return this.request(`/dashboard/progress/${userId}?days=${days}`);
    }

    async getRecommendations(userId) {
        return this.request(`/dashboard/recommendations/${userId}`);
    }

    // Courses methods
    async getCourses(filters = {}) {
        const params = new URLSearchParams(filters);
        return this.request(`/courses?${params}`);
    }

    async getCourse(courseId) {
        return this.request(`/courses/${courseId}`);
    }

    async createCourse(courseData) {
        return this.request('/courses', {
            method: 'POST',
            body: JSON.stringify(courseData)
        });
    }

    async updateCourse(courseId, courseData) {
        return this.request(`/courses/${courseId}`, {
            method: 'PUT',
            body: JSON.stringify(courseData)
        });
    }

    async deleteCourse(courseId) {
        return this.request(`/courses/${courseId}`, {
            method: 'DELETE'
        });
    }

    async enrollInCourse(courseId) {
        return this.request(`/courses/${courseId}/enroll`, {
            method: 'POST'
        });
    }

    async updateCourseProgress(courseId, progress) {
        return this.request(`/courses/${courseId}/progress`, {
            method: 'PUT',
            body: JSON.stringify({ progress })
        });
    }

    // Groups methods
    async getGroups() {
        return this.request('/groups');
    }

    async getGroup(groupId) {
        return this.request(`/groups/${groupId}`);
    }

    async createGroup(groupData) {
        return this.request('/groups', {
            method: 'POST',
            body: JSON.stringify(groupData)
        });
    }

    async updateGroup(groupId, groupData) {
        return this.request(`/groups/${groupId}`, {
            method: 'PUT',
            body: JSON.stringify(groupData)
        });
    }

    async joinGroup(groupId) {
        return this.request(`/groups/${groupId}/join`, {
            method: 'POST'
        });
    }

    async leaveGroup(groupId) {
        return this.request(`/groups/${groupId}/leave`, {
            method: 'POST'
        });
    }

    async getGroupMembers(groupId) {
        return this.request(`/groups/${groupId}/members`);
    }

    // Tasks methods
    async getTasks(userId, filters = {}) {
        const params = new URLSearchParams(filters);
        return this.request(`/tasks/${userId}?${params}`);
    }

    async getTask(taskId) {
        return this.request(`/tasks/${taskId}`);
    }

    async createTask(taskData) {
        return this.request('/tasks', {
            method: 'POST',
            body: JSON.stringify(taskData)
        });
    }

    async updateTask(taskId, taskData) {
        return this.request(`/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify(taskData)
        });
    }

    async deleteTask(taskId) {
        return this.request(`/tasks/${taskId}`, {
            method: 'DELETE'
        });
    }

    async completeTask(taskId) {
        return this.request(`/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: 'completed' })
        });
    }

    // Achievements methods
    async getAchievements() {
        return this.request('/achievements');
    }

    async getUserAchievements(userId) {
        return this.request(`/achievements/${userId}`);
    }

    async unlockAchievement(achievementId) {
        return this.request(`/achievements/${achievementId}/unlock`, {
            method: 'POST'
        });
    }

    // File upload methods
    async uploadAvatar(file) {
        const formData = new FormData();
        formData.append('avatar', file);

        return this.request('/upload/avatar', {
            method: 'POST',
            body: formData,
            headers: {
                ...this.getAuthHeaders()
                // Don't set Content-Type for FormData
            }
        });
    }

    // Utility methods
    isAuthenticated() {
        return !!this.token;
    }

    async verifyToken() {
        try {
            return await this.request('/auth/verify');
        } catch (error) {
            this.logout();
            throw error;
        }
    }

    // Error handling wrapper
    async safeRequest(endpoint, options = {}) {
        try {
            return await this.request(endpoint, options);
        } catch (error) {
            if (error.message.includes('token')) {
                this.logout();
                window.location.href = '/secondary.html/login/login.html';
            }
            throw error;
        }
    }
}

// Create global API client instance
const api = new ApiClient();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ApiClient;
} else {
    window.ApiClient = ApiClient;
    window.api = api;
}
