CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  sold_at TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'cancelled')),
  channel TEXT NOT NULL DEFAULT 'WhatsApp',
  payment_method TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  items_text TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_status_sold_at ON sales(status, sold_at DESC);
