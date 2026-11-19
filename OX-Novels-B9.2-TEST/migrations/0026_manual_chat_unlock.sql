ALTER TABLE users ADD COLUMN manual_chat_unlocked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_manual_chat_unlocked
  ON users(manual_chat_unlocked_at);
