-- Add OAuth and Email Verification fields
-- SQLite limitation: Cannot add UNIQUE column directly with ALTER TABLE
-- We need to handle this differently or just add column without UNIQUE constraint first
-- and rely on application logic or recreate table.
-- For simplicity in migration, we'll add columns without unique constraint in DB
-- but enforce it in application or use index.

ALTER TABLE users ADD COLUMN google_id TEXT;
ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0; -- 0: false, 1: true

-- Create unique index for google_id instead of column constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

-- Verification Tokens table
CREATE TABLE IF NOT EXISTS verification_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON verification_tokens(token);
