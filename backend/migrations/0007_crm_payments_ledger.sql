-- CRM, cobros multimoneda y libro operativo (no sustituye contabilidad fiscal).
-- Todos los importes se guardan como enteros escalados; nunca como REAL.

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  normalized_phone TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  default_address TEXT NOT NULL DEFAULT '',
  internal_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  archived_at TEXT,
  archived_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_customers_updated ON customers(updated_at DESC);

ALTER TABLE stock_orders ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE stock_orders ADD COLUMN voided_at TEXT;
ALTER TABLE stock_orders ADD COLUMN voided_by TEXT;
ALTER TABLE stock_orders ADD COLUMN void_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE sales ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN customer_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE sales ADD COLUMN reference_currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE sales ADD COLUMN functional_currency TEXT NOT NULL DEFAULT 'USD' CHECK (functional_currency = 'USD');
ALTER TABLE sales ADD COLUMN functional_total_cents INTEGER CHECK (functional_total_cents IS NULL OR functional_total_cents >= 0);
ALTER TABLE sales ADD COLUMN functional_exchange_rate_id TEXT;
ALTER TABLE sales ADD COLUMN functional_exchange_rate_scaled INTEGER CHECK (functional_exchange_rate_scaled IS NULL OR functional_exchange_rate_scaled > 0);
ALTER TABLE sales ADD COLUMN functional_exchange_rate_value_date TEXT;
ALTER TABLE sales ADD COLUMN reference_exchange_rate_id TEXT;
ALTER TABLE sales ADD COLUMN reference_exchange_rate_scaled INTEGER CHECK (reference_exchange_rate_scaled IS NULL OR reference_exchange_rate_scaled > 0);
ALTER TABLE sales ADD COLUMN reference_exchange_rate_value_date TEXT;
ALTER TABLE sales ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'legacy'
  CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'voided', 'legacy'));
ALTER TABLE sales ADD COLUMN voided_at TEXT;
ALTER TABLE sales ADD COLUMN voided_by TEXT;
ALTER TABLE sales ADD COLUMN void_reason TEXT NOT NULL DEFAULT '';

-- REF es únicamente la etiqueta pública. La base monetaria persistida continúa
-- siendo USD/EUR y el libro usa USD como moneda funcional.
UPDATE sales SET reference_currency = CASE WHEN currency = 'EUR' THEN 'EUR' ELSE 'USD' END;
UPDATE sales SET functional_total_cents = total_cents WHERE currency = 'USD';

CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON sales(payment_status, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_orders_customer ON stock_orders(customer_id, created_at DESC);

ALTER TABLE inventory_movements ADD COLUMN sale_id TEXT REFERENCES sales(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_sale ON inventory_movements(sale_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  product_id TEXT,
  sku TEXT,
  item_name_snapshot TEXT NOT NULL,
  option_summary_snapshot TEXT NOT NULL DEFAULT '',
  image_url_snapshot TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_currency TEXT NOT NULL CHECK (price_currency IN ('USD', 'EUR')),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sale_item_inventory_units (
  sale_item_id TEXT NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (sale_item_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_sale_item_inventory_sku ON sale_item_inventory_units(sku);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'BCV' CHECK (provider = 'BCV'),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'EUR')),
  rate_scaled INTEGER NOT NULL CHECK (rate_scaled > 0),
  rate_scale INTEGER NOT NULL DEFAULT 8 CHECK (rate_scale = 8),
  rate_side TEXT NOT NULL DEFAULT 'reference' CHECK (rate_side = 'reference'),
  operation_date TEXT,
  value_date TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('official_html', 'manual_official')),
  source_hash TEXT NOT NULL DEFAULT '',
  manual_reason TEXT NOT NULL DEFAULT '',
  validation_status TEXT NOT NULL CHECK (validation_status IN ('official', 'manual_confirmed')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup
  ON exchange_rates(currency, value_date DESC, validation_status, observed_at DESC);

CREATE TABLE IF NOT EXISTS exchange_rate_refresh_state (
  id TEXT PRIMARY KEY CHECK (id = 'bcv-homepage'),
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_value_date TEXT,
  last_error TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO exchange_rate_refresh_state (id, last_error)
VALUES ('bcv-homepage', '');

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  target_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at DESC);

-- Guardia CAS append-only. Cada mutación de una misma entidad reclama la
-- siguiente versión dentro del mismo batch D1 que modifica inventario/libro.
-- Dos solicitudes que leyeron la misma versión no pueden confirmar ambas.
CREATE TABLE IF NOT EXISTS entity_mutation_claims (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('sale', 'expense', 'stock_order')),
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  operation TEXT NOT NULL,
  request_key TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id, version)
);

CREATE INDEX IF NOT EXISTS idx_entity_mutation_created
  ON entity_mutation_claims(created_at DESC);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  order_id TEXT REFERENCES stock_orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'voided', 'refunded')),
  method TEXT NOT NULL,
  paid_currency TEXT NOT NULL CHECK (paid_currency IN ('VES', 'USD', 'EUR')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  amount_scale INTEGER NOT NULL CHECK (amount_scale = 2),
  reference_currency TEXT NOT NULL CHECK (reference_currency IN ('USD', 'EUR')),
  reference_amount_cents INTEGER NOT NULL CHECK (reference_amount_cents >= 0),
  functional_currency TEXT NOT NULL DEFAULT 'USD' CHECK (functional_currency = 'USD'),
  functional_amount_cents INTEGER NOT NULL CHECK (functional_amount_cents >= 0),
  exchange_rate_id TEXT REFERENCES exchange_rates(id) ON DELETE RESTRICT,
  rate_basis TEXT CHECK (rate_basis IS NULL OR rate_basis IN ('USD', 'EUR')),
  exchange_rate_scaled INTEGER CHECK (exchange_rate_scaled IS NULL OR exchange_rate_scaled > 0),
  exchange_rate_scale INTEGER CHECK (exchange_rate_scale IS NULL OR exchange_rate_scale = 8),
  exchange_rate_value_date TEXT,
  exchange_rate_source_url TEXT NOT NULL DEFAULT '',
  exchange_rate_source_kind TEXT NOT NULL DEFAULT '',
  functional_exchange_rate_id TEXT REFERENCES exchange_rates(id) ON DELETE RESTRICT,
  functional_exchange_rate_scaled INTEGER CHECK (functional_exchange_rate_scaled IS NULL OR functional_exchange_rate_scaled > 0),
  functional_exchange_rate_value_date TEXT,
  transaction_reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  payment_date TEXT NOT NULL,
  confirmed_by TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  voided_by TEXT,
  voided_at TEXT,
  void_reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id, confirmed_at);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id, confirmed_at);
CREATE INDEX IF NOT EXISTS idx_payments_currency_date ON payments(paid_currency, confirmed_at DESC);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  currency TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  system_account INTEGER NOT NULL DEFAULT 1 CHECK (system_account IN (0, 1)),
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO accounts VALUES ('asset-receivable-usd', '1100', 'Cuentas por cobrar (funcional)', 'asset', 'USD', 1, 1, datetime('now'));
INSERT OR IGNORE INTO accounts VALUES ('asset-cash-ves', '1110', 'Efectivo VES', 'asset', 'VES', 1, 1, datetime('now'));
INSERT OR IGNORE INTO accounts VALUES ('asset-cash-usd', '1111', 'Efectivo USD', 'asset', 'USD', 1, 1, datetime('now'));
INSERT OR IGNORE INTO accounts VALUES ('asset-cash-eur', '1112', 'Efectivo EUR', 'asset', 'EUR', 1, 1, datetime('now'));
INSERT OR IGNORE INTO accounts VALUES ('asset-bank-ves', '1120', 'Banco VES', 'asset', 'VES', 1, 1, datetime('now'));
INSERT OR IGNORE INTO accounts VALUES ('asset-bank-usd', '1121', 'Banco USD', 'asset', 'USD', 1, 1, datetime('now'));
INSERT OR IGNORE INTO accounts VALUES ('asset-bank-eur', '1122', 'Banco EUR', 'asset', 'EUR', 1, 1, datetime('now'));
INSERT OR IGNORE INTO accounts VALUES ('asset-digital-usd', '1130', 'Billetera digital USD', 'asset', 'USD', 1, 1, datetime('now'));
INSERT OR IGNORE INTO accounts VALUES ('asset-recoverable-usd', '1140', 'Anticipos y montos por recuperar', 'asset', 'USD', 1, 1, datetime('now'));
INSERT OR IGNORE INTO accounts VALUES ('liability-customer-credit-usd', '2100', 'Créditos a favor de clientes', 'liability', 'USD', 1, 1, datetime('now'));
INSERT OR IGNORE INTO accounts VALUES ('income-sales-usd', '4100', 'Ventas (funcional)', 'income', 'USD', 1, 1, datetime('now'));
INSERT OR IGNORE INTO accounts VALUES ('income-fx-gain-usd', '4200', 'Ganancia cambiaria realizada', 'income', 'USD', 1, 1, datetime('now'));
INSERT OR IGNORE INTO accounts VALUES ('expense-operating-usd', '5100', 'Gastos operativos (funcional)', 'expense', 'USD', 1, 1, datetime('now'));
INSERT OR IGNORE INTO accounts VALUES ('expense-fx-loss-usd', '5200', 'Pérdida cambiaria realizada', 'expense', 'USD', 1, 1, datetime('now'));

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  entry_date TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('sale', 'payment', 'expense', 'reversal', 'adjustment')),
  source_id TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  reversal_of_id TEXT REFERENCES journal_entries(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reversed_by TEXT,
  reversed_at TEXT,
  reversal_reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON journal_entries(source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_unique_origin
  ON journal_entries(source_type, source_id)
  WHERE source_type IN ('sale', 'payment', 'expense');

CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY,
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  functional_currency TEXT NOT NULL DEFAULT 'USD' CHECK (functional_currency = 'USD'),
  debit_functional_cents INTEGER NOT NULL DEFAULT 0 CHECK (debit_functional_cents >= 0),
  credit_functional_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_functional_cents >= 0),
  original_currency TEXT NOT NULL,
  original_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (original_amount_minor >= 0),
  original_amount_scale INTEGER NOT NULL DEFAULT 2 CHECK (original_amount_scale = 2),
  memo TEXT NOT NULL DEFAULT '',
  CHECK ((debit_functional_cents > 0 AND credit_functional_cents = 0) OR (credit_functional_cents > 0 AND debit_functional_cents = 0))
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id, journal_entry_id);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  amount_scale INTEGER NOT NULL CHECK (amount_scale = 2),
  currency TEXT NOT NULL CHECK (currency IN ('VES', 'USD', 'EUR')),
  payment_method TEXT NOT NULL,
  reference_currency TEXT NOT NULL CHECK (reference_currency IN ('USD', 'EUR')),
  reference_amount_cents INTEGER NOT NULL CHECK (reference_amount_cents > 0),
  functional_currency TEXT NOT NULL DEFAULT 'USD' CHECK (functional_currency = 'USD'),
  functional_amount_cents INTEGER NOT NULL CHECK (functional_amount_cents > 0),
  exchange_rate_id TEXT REFERENCES exchange_rates(id) ON DELETE RESTRICT,
  rate_basis TEXT CHECK (rate_basis IS NULL OR rate_basis IN ('USD', 'EUR')),
  exchange_rate_scaled INTEGER CHECK (exchange_rate_scaled IS NULL OR exchange_rate_scaled > 0),
  exchange_rate_scale INTEGER CHECK (exchange_rate_scale IS NULL OR exchange_rate_scale = 8),
  exchange_rate_value_date TEXT,
  exchange_rate_source_url TEXT NOT NULL DEFAULT '',
  exchange_rate_source_kind TEXT NOT NULL DEFAULT '',
  functional_exchange_rate_id TEXT REFERENCES exchange_rates(id) ON DELETE RESTRICT,
  functional_exchange_rate_scaled INTEGER CHECK (functional_exchange_rate_scaled IS NULL OR functional_exchange_rate_scaled > 0),
  functional_exchange_rate_value_date TEXT,
  transaction_reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  voided_by TEXT,
  voided_at TEXT,
  void_reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status, expense_date DESC);

ALTER TABLE audit_log ADD COLUMN entity_type TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_log ADD COLUMN entity_id TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_log ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id, created_at DESC);
