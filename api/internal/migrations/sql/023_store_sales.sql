-- Counter sales: the owner registers sales made at a branch as confirmed
-- orders of the "store" channel, paid in cash, by card or with the branch QR.
ALTER TABLE orders ADD COLUMN channel TEXT NOT NULL DEFAULT 'online'
    CHECK (channel IN ('online', 'store'));
ALTER TABLE orders ADD COLUMN discount_minor BIGINT NOT NULL DEFAULT 0
    CHECK (discount_minor >= 0);

-- The column CHECK from migration 019 has a generated name; find it by its definition.
DO $$
DECLARE item record;
BEGIN
    FOR item IN SELECT conname FROM pg_constraint
        WHERE conrelid = 'orders'::regclass AND contype = 'c'
          AND conname <> 'orders_payment_method_status'
          AND pg_get_constraintdef(oid) LIKE '%payment_method%'
    LOOP
        EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', item.conname);
    END LOOP;
END $$;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IN ('whatsapp', 'qr', 'cash', 'card', 'store_qr'));

ALTER TABLE orders DROP CONSTRAINT orders_payment_method_status;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_status CHECK (
    (payment_method = 'whatsapp' AND payment_status = 'not_required')
    OR (payment_method = 'qr' AND payment_status <> 'not_required')
    OR (payment_method IN ('cash', 'card', 'store_qr') AND payment_status = 'verified'));

ALTER TABLE orders ADD CONSTRAINT orders_channel_payment_method CHECK (
    (channel = 'store') = (payment_method IN ('cash', 'card', 'store_qr')));
