-- Detect accidental reuse of an order request key with different checkout data.
-- Older rows, if any, remain readable without a fingerprint.
ALTER TABLE orders ADD COLUMN request_fingerprint CHAR(64);
ALTER TABLE orders ADD CONSTRAINT orders_request_fingerprint_format
    CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[a-f0-9]{64}$');
ALTER TABLE orders ADD COLUMN confirmed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
