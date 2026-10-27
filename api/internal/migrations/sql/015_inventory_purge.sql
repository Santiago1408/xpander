-- Permanent deletion from the paperera may remove inventory history only for
-- products without orders. Ordinary stock corrections remain append-only.
CREATE OR REPLACE FUNCTION reject_stock_movement_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' AND current_setting('xpander.allow_stock_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'stock movements are append-only; record an adjustment instead';
END;
$$;
