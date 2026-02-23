-- O'QIV Learning Platform Database Schema
-- MySQL Database Initialization Script

-- Create database
CREATE DATABASE IF NOT EXISTS oqiv_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE oqiv_platform;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    bio TEXT,
    avatar VARCHAR(255),
    role ENUM('student', 'teacher', 'admin') DEFAULT 'student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role)
);

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    teacher_id INT,
    avatar VARCHAR(255),
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_teacher (teacher_id),
    INDEX idx_category (category),
    INDEX idx_status (status)
);

-- Groups table (for student teams)
CREATE TABLE IF NOT EXISTS groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    logo VARCHAR(255),
    status ENUM('active', 'in_development', 'on_hold') DEFAULT 'active',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_created_by (created_by),
    INDEX idx_status (status)
);

-- Group members table
CREATE TABLE IF NOT EXISTS group_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT,
    user_id INT,
    role ENUM('member', 'leader') DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_group_user (group_id, user_id),
    INDEX idx_group_id (group_id),
    INDEX idx_user_id (user_id)
);

-- Course enrollments table
CREATE TABLE IF NOT EXISTS course_enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT,
    user_id INT,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    progress DECIMAL(5,2) DEFAULT 0.00,
    status ENUM('active', 'completed', 'dropped') DEFAULT 'active',
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_course_user (course_id, user_id),
    INDEX idx_course_id (course_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    course_id INT,
    assigned_to INT,
    priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
    status ENUM('pending', 'in_progress', 'completed') DEFAULT 'pending',
    due_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_course_id (course_id),
    INDEX idx_assigned_to (assigned_to),
    INDEX idx_status (status),
    INDEX idx_due_date (due_date)
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    group_id INT,
    status ENUM('active', 'completed', 'in_progress') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    INDEX idx_group_id (group_id),
    INDEX idx_status (status)
);

-- Achievements table
CREATE TABLE IF NOT EXISTS achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    type ENUM('course', 'team', 'personal') DEFAULT 'personal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type (type)
);

-- User achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    achievement_id INT,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_achievement (user_id, achievement_id),
    INDEX idx_user_id (user_id),
    INDEX idx_achievement_id (achievement_id)
);

-- Insert sample data
INSERT INTO users (full_name, email, password, role) VALUES 
('Ali Valiyev', 'ali@oqiv.uz', '$2a$10$example_hash', 'teacher'),
('Karim Sobirov', 'karim@oqiv.uz', '$2a$10$example_hash', 'teacher'),
('Nodira Karimova', 'nodira@oqiv.uz', '$2a$10$example_hash', 'teacher'),
('Sunnat Ulashev', 'sunnat@oqiv.uz', '$2a$10$example_hash', 'student');

INSERT INTO courses (title, description, category, teacher_id) VALUES 
('React.js va Next.js', 'Modern web dasturlashni o''rganing. React.js, Next.js va zamonaviy texnologiyalar bo''yicha chuqur bilim beriladi.', 'Web dasturlash', 1),
('Python dasturlash', 'Python dasturlash tilini chuqur o''rganish. Django, FastAPI va ma''lumotlar bazasi bilish ishlari.', 'Backend dasturlash', 2),
('UI/UX Dizayn', 'Figma, Adobe XD va Sketch yordamida zamonaviy interfeyslar yaratishni o''rganing. Portfolio yaratish ko''nikmalari.', 'Dizayn', 3),
('Mobil dasturlash', 'React Native va Flutter yordamida mobil ilovalar yaratish. iOS va Android platformlari uchun dasturlash.', 'Mobile dev', 1),
('Data Science', 'Machine Learning, AI va ma''lumotlar tahlili. Python, TensorFlow va zamonaviy analitik usullar.', 'Ma''lumotlar tahlili', 4);

INSERT INTO achievements (title, description, icon, type) VALUES 
('Tezkor o''rganuvchi', '30 kun ketma-ket o''rganish', 'fa-star', 'personal'),
('Kod ustasi', '100+ vazifa bajardi', 'fa-code', 'course'),
('Jamoa a''zosi', '5+ guruhda faol', 'fa-users', 'team'),
('Sertifikatli', '10+ kurs tugatdi', 'fa-certificate', 'course'),
('Dasturlash chempioni', 'Barcha dasturlash vazifalarini tugatdi', 'fa-trophy', 'course'),
('Loyihalar ustasi', '5+ loyiha muvaffaqiyatli yakunladi', 'fa-project-diagram', 'team');

INSERT INTO groups (name, description, created_by) VALUES 
('Alpha Developers', 'E-commerce platformasi uchun o''quvchi jamoasi. Frontend va backend dasturchilar, dizaynerlar va proekt rahbarlari.', 4),
('Beta Innovations', 'Mobil ilovalar va AI yechimlari bo''yicha o''quvchi jamoasi. React Native, Flutter va machine learning texnologiyalari.', 4),
('Gamma Design', 'UI/UX dizayn va brending bo''yicha o''quvchi jamoasi. Figma, Adobe Creative Suite va zamonaviy dizayn usullari.', 4),
('Delta Analytics', 'Ma''lumotlar tahlili va biznes intellekti bo''yicha o''quvchi jamoasi. Python, R va zamonaviy analitik instrumentlar.', 4);

-- Insert sample enrollments
INSERT INTO course_enrollments (course_id, user_id, progress, status) VALUES 
(1, 4, 85.00, 'active'),
(2, 4, 76.00, 'active'),
(3, 4, 92.00, 'active'),
(4, 4, 68.00, 'active'),
(5, 4, 81.00, 'active');

-- Insert sample group memberships
INSERT INTO group_members (group_id, user_id, role) VALUES 
(1, 4, 'leader'),
(2, 4, 'member'),
(3, 4, 'member'),
(4, 4, 'member');

-- Insert sample tasks
INSERT INTO tasks (title, description, course_id, assigned_to, priority, status, due_date) VALUES 
('React.js komponentlarini yaratish', 'E-commerce platformasi uchun mahsulot kartochkalari va savat komponentlarini React.js da yaratish. Responsive dizayn va animatsiyalarni qo''llash kerak.', 1, 4, 'high', 'in_progress', '2026-02-25'),
('API integratsiyasi', 'Backend API bilan integratsiyani yo''lga qo''yish. Foydalanuvchi autentifikatsiyasi va ma''lumotlar almashinuvi uchun so''rovlar yozish.', 2, 4, 'medium', 'pending', '2026-02-28'),
('Dokumentatsiyani yozish', 'Proektning texnik dokumentatsiyasini yozish va GitHub ga yuklash. Kodga izohlar qoldirish va README faylini yangilash.', 1, 4, 'low', 'completed', '2026-02-20'),
('Database optimallashtirish', 'MySQL database so''rovlarini optimallashtirish. Indekslarni qo''shish va sekin ishlayotgan so''rovlarni aniqlash hamda tuzatish.', 5, 4, 'high', 'in_progress', '2026-02-22'),
('Test yozish', 'Yaratilgan funksiyalar uchun unit testlar yozish. Jest va React Testing Library yordamida testlarni qamrab olish darajasini 80% ga yetkazish.', 2, 4, 'medium', 'pending', '2026-03-02');

-- Insert sample user achievements
INSERT INTO user_achievements (user_id, achievement_id) VALUES 
(4, 1),
(4, 2),
(4, 3),
(4, 4);

-- Create views for common queries
CREATE VIEW user_dashboard_stats AS
SELECT 
    u.id as user_id,
    u.full_name,
    COUNT(DISTINCT ce.course_id) as active_courses,
    COUNT(CASE WHEN ce.status = 'completed' THEN 1 END) as completed_courses,
    AVG(ce.progress) as avg_progress,
    COUNT(DISTINCT t.id) as total_tasks,
    COUNT(CASE WHEN t.status = 'pending' AND t.due_date <= CURDATE() THEN 1 END) as overdue_tasks,
    COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) as in_progress_tasks,
    COUNT(DISTINCT gm.group_id) as active_groups,
    COUNT(DISTINCT ua.achievement_id) as achievements_count
FROM users u
LEFT JOIN course_enrollments ce ON u.id = ce.user_id AND ce.status = 'active'
LEFT JOIN tasks t ON u.id = t.assigned_to
LEFT JOIN group_members gm ON u.id = gm.user_id
LEFT JOIN groups g ON gm.group_id = g.id AND g.status = 'active'
LEFT JOIN user_achievements ua ON u.id = ua.user_id
GROUP BY u.id, u.full_name;

CREATE VIEW course_details AS
SELECT 
    c.*,
    u.full_name as teacher_name,
    u.email as teacher_email,
    COUNT(ce.user_id) as enrolled_students,
    AVG(ce.progress) as avg_progress
FROM courses c
LEFT JOIN users u ON c.teacher_id = u.id
LEFT JOIN course_enrollments ce ON c.id = ce.course_id AND ce.status = 'active'
WHERE c.status = 'active'
GROUP BY c.id;
