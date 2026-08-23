CREATE TABLE IF NOT EXISTS passkey_login_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_passkey_login_challenges_expires_at
ON passkey_login_challenges(expires_at);
