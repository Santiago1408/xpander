-- Replace the old vocabulary/option model with product labels and two size fields.
-- The data reset for this test cycle is an explicit command, not a migration side effect.
ALTER TABLE products ADD COLUMN style_label TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN audience_label TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN color_label TEXT NOT NULL DEFAULT '';
UPDATE products p SET
    style_label=COALESCE((SELECT upper(c.name) FROM categories c WHERE c.id=p.category_id), ''),
    audience_label=COALESCE((SELECT upper(c.name) FROM categories c WHERE c.id=p.audience_category_id), ''),
    color_label=COALESCE((SELECT upper(c.name) FROM colors c WHERE c.id=p.color_id), '');

ALTER TABLE product_variants ADD COLUMN size_alpha TEXT;
ALTER TABLE product_variants ADD COLUMN size_numeric TEXT;
ALTER TABLE product_variants ADD COLUMN size_alpha_key TEXT;
ALTER TABLE product_variants ADD COLUMN size_numeric_key TEXT;
UPDATE product_variants SET
    size_numeric=CASE WHEN btrim(size_label) ~ '^[0-9]' THEN upper(btrim(size_label)) ELSE NULL END,
    size_alpha=CASE WHEN btrim(size_label) ~ '^[0-9]' THEN NULL ELSE upper(btrim(size_label)) END;
ALTER TABLE product_variants ADD CONSTRAINT product_variants_has_size
    CHECK (NULLIF(btrim(COALESCE(size_alpha,'')), '') IS NOT NULL
        OR NULLIF(btrim(COALESCE(size_numeric,'')), '') IS NOT NULL);
ALTER TABLE product_variants ADD CONSTRAINT product_variants_size_alpha_length
    CHECK (size_alpha IS NULL OR length(size_alpha) <= 40);
ALTER TABLE product_variants ADD CONSTRAINT product_variants_size_numeric_length
    CHECK (size_numeric IS NULL OR length(size_numeric) <= 40);
ALTER TABLE product_variants DROP COLUMN size_label;
ALTER TABLE product_variants DROP COLUMN option_signature;
CREATE UNIQUE INDEX product_variants_live_alpha_uidx
    ON product_variants (product_id, size_alpha_key)
    WHERE deleted_at IS NULL AND size_alpha_key IS NOT NULL;
CREATE UNIQUE INDEX product_variants_live_numeric_uidx
    ON product_variants (product_id, size_numeric_key)
    WHERE deleted_at IS NULL AND size_numeric_key IS NOT NULL;

DROP TABLE variant_option_values;
DROP TABLE product_option_values;
DROP TABLE attribute_options;
DROP TABLE attribute_definitions;
ALTER TABLE products DROP COLUMN category_id;
ALTER TABLE products DROP COLUMN audience_category_id;
ALTER TABLE products DROP COLUMN color_id;
DROP TABLE categories;
DROP TABLE colors;
ALTER TABLE order_items DROP COLUMN attributes_snapshot;

-- Brands are now managed directly. Previously trashed brands are removed.
UPDATE products SET brand_id=NULL, revision=revision+1
    WHERE brand_id IN (SELECT id FROM brands WHERE deleted_at IS NOT NULL);
DELETE FROM brands WHERE deleted_at IS NOT NULL;
ALTER TABLE brands DROP COLUMN deleted_at;
ALTER TABLE brands DROP COLUMN is_active;
CREATE UNIQUE INDEX brands_canonical_key_uidx ON brands (canonical_key)
    WHERE canonical_key IS NOT NULL;
