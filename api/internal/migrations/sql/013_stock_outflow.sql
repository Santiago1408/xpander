-- A negative movement must update an existing balance. An upsert with a
-- negative proposed quantity can fail its CHECK before ON CONFLICT updates it.
CREATE OR REPLACE FUNCTION apply_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.delta < 0 THEN
        UPDATE branch_stock
        SET quantity = quantity + NEW.delta, updated_at = now()
        WHERE branch_id = NEW.branch_id AND variant_id = NEW.variant_id
          AND quantity >= -(NEW.delta::bigint);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'insufficient stock for branch %, variant %',
                NEW.branch_id, NEW.variant_id USING ERRCODE = '23514';
        END IF;
    ELSE
        INSERT INTO branch_stock (branch_id, variant_id, quantity, updated_at)
        VALUES (NEW.branch_id, NEW.variant_id, NEW.delta, now())
        ON CONFLICT (branch_id, variant_id)
        DO UPDATE SET quantity = branch_stock.quantity + EXCLUDED.quantity,
                      updated_at = now();
    END IF;
    RETURN NEW;
END;
$$;
