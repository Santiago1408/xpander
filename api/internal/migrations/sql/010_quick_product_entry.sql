-- One-screen catalog entry. Legacy category/attribute relations remain readable.
ALTER TABLE categories ADD COLUMN kind TEXT NOT NULL DEFAULT 'style'
    CHECK (kind IN ('style', 'audience'));
ALTER TABLE categories ADD COLUMN canonical_key TEXT;
CREATE UNIQUE INDEX categories_live_kind_key_uidx ON categories (kind, canonical_key)
    WHERE canonical_key IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE brands ADD COLUMN canonical_key TEXT;
CREATE UNIQUE INDEX brands_live_key_uidx ON brands (canonical_key)
    WHERE canonical_key IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE colors (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    canonical_key TEXT NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT colors_name_not_blank CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX colors_live_key_uidx ON colors (canonical_key)
    WHERE deleted_at IS NULL;

ALTER TABLE products ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE products ADD COLUMN audience_category_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT;
ALTER TABLE products ADD COLUMN color_id BIGINT REFERENCES colors(id) ON DELETE RESTRICT;
ALTER TABLE products ADD COLUMN code INTEGER;
ALTER TABLE products ADD COLUMN next_variant_number SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN create_request_key UUID UNIQUE;
CREATE SEQUENCE xpander_product_code_seq;
WITH numbered AS (
    SELECT id, row_number() OVER (ORDER BY id)::integer AS new_code FROM products
)
UPDATE products p SET code=n.new_code FROM numbered n WHERE p.id=n.id;
SELECT setval('xpander_product_code_seq',
    COALESCE((SELECT max(code) FROM products), 0) + 1, false);
ALTER TABLE products ALTER COLUMN code SET DEFAULT nextval('xpander_product_code_seq');
ALTER TABLE products ALTER COLUMN code SET NOT NULL;
ALTER TABLE products ADD CONSTRAINT products_code_range CHECK (code BETWEEN 1 AND 9999);
ALTER TABLE products ADD CONSTRAINT products_code_unique UNIQUE (code);
ALTER TABLE products ADD CONSTRAINT products_next_variant_number_range
    CHECK (next_variant_number BETWEEN 1 AND 100);

ALTER TABLE product_variants ADD COLUMN size_label TEXT;
ALTER TABLE product_variants ADD COLUMN variant_number SMALLINT;
ALTER TABLE product_variants ADD COLUMN code TEXT;
WITH ranked AS (
    SELECT v.id, v.product_id,
        row_number() OVER (PARTITION BY v.product_id ORDER BY v.id)::smallint AS new_number,
        count(*) OVER (PARTITION BY v.product_id) AS variant_count
    FROM product_variants v
)
UPDATE product_variants v SET
    variant_number=r.new_number,
    code=lpad(p.code::text, 4, '0') || lpad(r.new_number::text, 2, '0'),
    size_label=COALESCE(
        (SELECT o.value FROM variant_option_values x
            JOIN attribute_options o ON o.id=x.option_id
            JOIN attribute_definitions d ON d.id=x.attribute_definition_id
            WHERE x.variant_id=v.id AND (lower(d.name) LIKE '%talla%' OR lower(d.code) LIKE '%talla%')
            ORDER BY d.id LIMIT 1),
        CASE WHEN r.variant_count=1 THEN 'ÚNICA'
            ELSE 'OPCIÓN ' || lpad(r.new_number::text, 2, '0') END)
FROM ranked r JOIN products p ON p.id=r.product_id WHERE v.id=r.id;
UPDATE products p SET next_variant_number=COALESCE(
    (SELECT max(v.variant_number) + 1 FROM product_variants v WHERE v.product_id=p.id), 1);
ALTER TABLE product_variants ALTER COLUMN size_label SET NOT NULL;
ALTER TABLE product_variants ALTER COLUMN size_label SET DEFAULT 'ÚNICA';
ALTER TABLE product_variants ALTER COLUMN variant_number SET NOT NULL;
ALTER TABLE product_variants ALTER COLUMN code SET NOT NULL;
ALTER TABLE product_variants ADD CONSTRAINT product_variants_size_not_blank CHECK (btrim(size_label) <> '');
ALTER TABLE product_variants ADD CONSTRAINT product_variants_number_range CHECK (variant_number BETWEEN 1 AND 99);
ALTER TABLE product_variants ADD CONSTRAINT product_variants_number_unique UNIQUE (product_id, variant_number);
ALTER TABLE product_variants ADD CONSTRAINT product_variants_code_format CHECK (code ~ '^[0-9]{6}$');
ALTER TABLE product_variants ADD CONSTRAINT product_variants_code_unique UNIQUE (code);

CREATE FUNCTION assign_variant_code() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    family_code INTEGER;
    ordinal_number INTEGER;
BEGIN
    UPDATE products SET next_variant_number=next_variant_number + 1
    WHERE id=NEW.product_id AND next_variant_number <= 99
    RETURNING code, next_variant_number - 1 INTO family_code, ordinal_number;
    IF family_code IS NULL THEN
        RAISE EXCEPTION 'product has no remaining variant codes' USING ERRCODE='23514';
    END IF;
    NEW.variant_number := ordinal_number;
    NEW.code := lpad(family_code::text, 4, '0') || lpad(ordinal_number::text, 2, '0');
    RETURN NEW;
END;
$$;
CREATE TRIGGER product_variants_assign_code BEFORE INSERT ON product_variants
    FOR EACH ROW EXECUTE FUNCTION assign_variant_code();
