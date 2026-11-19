PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('member','admin')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  seen_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages (user_id, id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_delivery ON chat_messages (sender_role, delivered_at, id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_seen ON chat_messages (sender_role, seen_at, id);
