-- Profile pictures are small data URLs (jpeg/png/webp, at most 40 KB), so the column must be bigger than VARCHAR(255)
ALTER TABLE users MODIFY COLUMN avatar MEDIUMTEXT NULL;
