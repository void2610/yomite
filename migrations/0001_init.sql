-- Yomite 初期スキーマ
CREATE TABLE IF NOT EXISTS pages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  project        TEXT NOT NULL DEFAULT '未分類',
  summary        TEXT NOT NULL DEFAULT '',
  decision_points TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  pinned         INTEGER NOT NULL DEFAULT 0,
  read_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_pages_project ON pages(project);
CREATE INDEX IF NOT EXISTS idx_pages_created ON pages(created_at DESC);

CREATE TABLE IF NOT EXISTS inbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  taken_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_inbox_taken ON inbox(taken_at);
