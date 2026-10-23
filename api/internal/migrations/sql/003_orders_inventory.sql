-- Prices and costs are integer centavos of BOB. Stock is kept per variant and branch.
CREATE TABLE branch_stock (
    branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (branch_id, variant_id)
);

CREATE INDEX branch_stock_variant_idx ON branch_stock (variant_id);

CREATE TABLE orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_request_id UUID NOT NULL UNIQUE,
    pickup_branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    pickup_branch_name TEXT NOT NULL,
    pickup_address TEXT,
    pickup_instructions TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_note TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    currency CHAR(3) NOT NULL DEFAULT 'BOB' CHECK (currency = 'BOB'),
    total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
    whatsapp_number TEXT NOT NULL,
    whatsapp_message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    CONSTRAINT orders_customer_name_not_blank CHECK (btrim(customer_name) <> ''),
    CONSTRAINT orders_pickup_branch_name_not_blank CHECK (btrim(pickup_branch_name) <> ''),
    CONSTRAINT orders_customer_phone_not_blank CHECK (btrim(customer_phone) <> ''),
    CONSTRAINT orders_whatsapp_number_not_blank CHECK (btrim(whatsapp_number) <> ''),
    CONSTRAINT orders_whatsapp_message_not_blank CHECK (btrim(whatsapp_message) <> ''),
    CONSTRAINT orders_status_timestamps CHECK (
        (status = 'pending' AND confirmed_at IS NULL AND cancelled_at IS NULL)
        OR (status = 'confirmed' AND confirmed_at IS NOT NULL AND cancelled_at IS NULL)
        OR (status = 'cancelled' AND confirmed_at IS NULL AND cancelled_at IS NOT NULL)
    )
);

CREATE INDEX orders_status_created_idx ON orders (status, created_at DESC, id DESC);
CREATE INDEX orders_branch_created_idx ON orders (pickup_branch_id, created_at DESC, id DESC);

CREATE TABLE order_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    variant_id BIGINT REFERENCES product_variants(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    variant_label TEXT,
    attributes_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    line_total_minor BIGINT GENERATED ALWAYS AS (unit_price_minor * quantity) STORED,
    CONSTRAINT order_items_product_name_not_blank CHECK (btrim(product_name) <> ''),
    CONSTRAINT order_items_sku_not_blank CHECK (btrim(sku) <> ''),
    CONSTRAINT order_items_attributes_object CHECK (jsonb_typeof(attributes_snapshot) = 'object')
);

CREATE INDEX order_items_order_idx ON order_items (order_id, id);
CREATE INDEX order_items_variant_idx ON order_items (variant_id);

CREATE TABLE stock_movements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    kind TEXT NOT NULL CHECK (kind IN ('purchase', 'adjustment', 'sale')),
    delta INTEGER NOT NULL CHECK (delta <> 0),
    unit_cost_minor BIGINT CHECK (unit_cost_minor IS NULL OR unit_cost_minor >= 0),
    order_item_id BIGINT REFERENCES order_items(id) ON DELETE RESTRICT,
    recorded_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stock_movements_kind_fields CHECK (
        (kind = 'purchase' AND delta > 0 AND unit_cost_minor IS NOT NULL AND order_item_id IS NULL)
        OR (kind = 'adjustment' AND unit_cost_minor IS NULL AND order_item_id IS NULL)
        OR (kind = 'sale' AND delta < 0 AND unit_cost_minor IS NULL AND order_item_id IS NOT NULL)
    )
);

CREATE INDEX stock_movements_branch_variant_idx
    ON stock_movements (branch_id, variant_id, created_at DESC, id DESC);
CREATE INDEX stock_movements_actor_idx ON stock_movements (recorded_by_user_id);
CREATE UNIQUE INDEX stock_movements_sale_item_uidx
    ON stock_movements (order_item_id) WHERE kind = 'sale';

-- The movement and resulting balance change are atomic. A negative balance violates
-- branch_stock.quantity's CHECK constraint and rolls back the movement too.
CREATE FUNCTION apply_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO branch_stock (branch_id, variant_id, quantity, updated_at)
    VALUES (NEW.branch_id, NEW.variant_id, NEW.delta, now())
    ON CONFLICT (branch_id, variant_id)
    DO UPDATE SET quantity = branch_stock.quantity + EXCLUDED.quantity,
                  updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER stock_movements_apply_balance
AFTER INSERT ON stock_movements
FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();

-- Corrections are new adjustments; audit entries are never edited or removed.
CREATE FUNCTION reject_stock_movement_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'stock movements are append-only; record an adjustment instead';
END;
$$;

CREATE TRIGGER stock_movements_append_only
BEFORE UPDATE OR DELETE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION reject_stock_movement_change();
