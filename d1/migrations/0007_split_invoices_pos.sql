ALTER TABLE invoice_po_records ADD COLUMN record_type TEXT CHECK (record_type IN ('INVOICE', 'PO'));

ALTER TABLE invoice_po_records ADD COLUMN paid_by TEXT NOT NULL DEFAULT '';
