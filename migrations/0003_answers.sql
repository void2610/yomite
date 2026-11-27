-- Yomite 拡張: 判断キットの回答をサーバー側 (D1) に保存する
CREATE TABLE IF NOT EXISTS answers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  question   TEXT NOT NULL,
  choice     TEXT NOT NULL DEFAULT '',
  comment    TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(slug, question)
);
CREATE INDEX IF NOT EXISTS idx_answers_slug ON answers(slug);
