ALTER TABLE orders ADD COLUMN price INT NULL;
ALTER TABLE orders ADD COLUMN course_id INT NULL;
ALTER TABLE orders ADD COLUMN handled_by INT NULL;
ALTER TABLE orders ADD COLUMN reply VARCHAR(1000) NULL;
ALTER TABLE orders MODIFY COLUMN status ENUM('pending','confirmed','rejected','offered','cancelled') NOT NULL DEFAULT 'pending';
