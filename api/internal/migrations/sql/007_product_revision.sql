-- Reject stale writes when the same product is edited in more than one session.
ALTER TABLE products ADD COLUMN revision BIGINT NOT NULL DEFAULT 0
    CHECK (revision >= 0);
