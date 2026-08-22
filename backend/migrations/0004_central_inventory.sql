CREATE TABLE IF NOT EXISTS inventory_items (
  sku TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  option_summary TEXT NOT NULL DEFAULT '',
  on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  track_stock INTEGER NOT NULL DEFAULT 0 CHECK (track_stock IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS inventory_balance_guard
BEFORE UPDATE OF on_hand, reserved ON inventory_items
WHEN NEW.on_hand < 0 OR NEW.reserved < 0 OR NEW.reserved > NEW.on_hand
BEGIN
  SELECT RAISE(ABORT, 'inventory_unavailable');
END;

CREATE TABLE IF NOT EXISTS stock_orders (
  id TEXT PRIMARY KEY,
  order_code TEXT NOT NULL UNIQUE,
  client_key TEXT NOT NULL UNIQUE,
  client_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'confirmed', 'cancelled', 'expired')),
  expires_at INTEGER NOT NULL,
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  fulfillment TEXT NOT NULL,
  requested_date TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  allergy_summary TEXT NOT NULL DEFAULT '',
  birthday_candle TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_by TEXT,
  cancelled_by TEXT
);

CREATE TABLE IF NOT EXISTS stock_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES stock_orders(id) ON DELETE CASCADE,
  sku TEXT,
  product_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  option_summary TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL,
  order_id TEXT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('adjustment', 'reservation', 'release', 'sale')),
  delta_on_hand INTEGER NOT NULL DEFAULT 0,
  delta_reserved INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE sales ADD COLUMN order_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_order_id ON sales(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_items(product_id, active);
CREATE INDEX IF NOT EXISTS idx_stock_orders_status_expiry ON stock_orders(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_stock_orders_created ON stock_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_order_items_order ON stock_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_sku ON inventory_movements(sku, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movement_order_sku_type ON inventory_movements(order_id, sku, movement_type) WHERE order_id IS NOT NULL AND movement_type IN ('reservation', 'release', 'sale');
