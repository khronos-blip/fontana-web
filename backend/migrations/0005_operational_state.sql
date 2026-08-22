CREATE TABLE IF NOT EXISTS operational_state (
  id TEXT PRIMARY KEY CHECK (id = 'production'),
  electricity_enabled INTEGER NOT NULL DEFAULT 1 CHECK (electricity_enabled IN (0, 1)),
  updated_by TEXT NOT NULL DEFAULT 'system',
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO operational_state (id, electricity_enabled, updated_by, updated_at)
VALUES ('production', 1, 'system', datetime('now'));
