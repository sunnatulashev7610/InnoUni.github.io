CREATE TABLE IF NOT EXISTS ai_materials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    topic VARCHAR(200) NOT NULL,
    kind VARCHAR(30) NOT NULL,
    body MEDIUMTEXT NOT NULL,
    provider VARCHAR(20) NULL,
    is_public TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_materials_user (user_id, id)
);

CREATE TABLE IF NOT EXISTS ai_material_usage (
    user_id INT NOT NULL,
    day DATE NOT NULL,
    used INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
