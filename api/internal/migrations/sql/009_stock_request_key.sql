-- A browser retry must not record the same initial stock movement twice.
ALTER TABLE stock_movements ADD COLUMN request_key UUID;
CREATE UNIQUE INDEX stock_movements_request_key_uidx
    ON stock_movements (request_key) WHERE request_key IS NOT NULL;
