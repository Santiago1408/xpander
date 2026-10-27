ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'whatsapp'
    CHECK (payment_method IN ('whatsapp', 'qr'));
ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (payment_status IN ('not_required', 'awaiting_receipt', 'submitted', 'verified', 'rejected'));
ALTER TABLE orders ADD COLUMN customer_access_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_status
    CHECK ((payment_method = 'whatsapp' AND payment_status = 'not_required')
       OR (payment_method = 'qr' AND payment_status <> 'not_required'));

CREATE TABLE order_payment_proofs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    storage_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 16777216),
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'verified', 'rejected')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT order_payment_proofs_review_state CHECK (
        (status = 'submitted' AND reviewed_at IS NULL AND reviewed_by_user_id IS NULL)
        OR (status <> 'submitted' AND reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL)
    )
);
CREATE INDEX order_payment_proofs_order_idx ON order_payment_proofs (order_id, id DESC);
CREATE UNIQUE INDEX order_payment_proofs_open_idx ON order_payment_proofs (order_id) WHERE status='submitted';
CREATE UNIQUE INDEX order_payment_proofs_verified_idx ON order_payment_proofs (order_id) WHERE status='verified';
