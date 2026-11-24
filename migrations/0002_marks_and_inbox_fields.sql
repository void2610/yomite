-- Yomite 拡張: 案件のピン/スター (スライド12)、インボックスの案件名と画像 (スライド21)
CREATE TABLE IF NOT EXISTS project_marks (
  project TEXT PRIMARY KEY,
  pinned  INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE inbox ADD COLUMN project TEXT NOT NULL DEFAULT '';
ALTER TABLE inbox ADD COLUMN image_key TEXT;
