CREATE TABLE fuel_records (
  id TEXT PRIMARY KEY,
  record_date TEXT NOT NULL,
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('PETROL', 'DIESEL')),
  quantity_millilitres INTEGER NOT NULL CHECK (quantity_millilitres > 0),
  vat_status TEXT NOT NULL CHECK (vat_status IN ('NON_VAT', 'VAT_INCLUDED')),
  entered_amount_halalas INTEGER NOT NULL CHECK (entered_amount_halalas >= 0),
  net_amount_halalas INTEGER NOT NULL CHECK (net_amount_halalas >= 0),
  vat_removed_halalas INTEGER NOT NULL CHECK (vat_removed_halalas >= 0),
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE invoice_po_records (
  id TEXT PRIMARY KEY,
  record_date TEXT NOT NULL,
  vat_status TEXT NOT NULL CHECK (vat_status IN ('NON_VAT', 'VAT_INCLUDED')),
  invoice_no TEXT,
  po_no TEXT,
  entered_amount_halalas INTEGER NOT NULL CHECK (entered_amount_halalas >= 0),
  net_amount_halalas INTEGER NOT NULL CHECK (net_amount_halalas >= 0),
  vat_removed_halalas INTEGER NOT NULL CHECK (vat_removed_halalas >= 0),
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(COALESCE(invoice_no, ''))) > 0 OR length(trim(COALESCE(po_no, ''))) > 0)
);

CREATE INDEX idx_fuel_records_month ON fuel_records(record_date, active);
CREATE INDEX idx_invoice_po_records_month ON invoice_po_records(record_date, active);
