-- Editable catalog entities and uploaded media stay addressable for historical
-- orders, stock movements, and page publications after removal from the panel.
ALTER TABLE categories ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE brands ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE attribute_definitions ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE attribute_options ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE product_variants ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE media ADD COLUMN deleted_at TIMESTAMPTZ;

-- An erroneous variant can be replaced with the same option combination.
-- Restoring it later fails cleanly if the replacement is still present.
ALTER TABLE product_variants DROP CONSTRAINT product_variants_product_id_option_signature_key;
CREATE UNIQUE INDEX product_variants_live_options_uidx
    ON product_variants (product_id, option_signature) WHERE deleted_at IS NULL;

-- New variants receive a readable SKU without depending on names or options.
-- Advance past any legacy manually entered XP-number codes.
CREATE SEQUENCE xpander_variant_sku_seq;
SELECT setval('xpander_variant_sku_seq',
    COALESCE((SELECT max(substring(sku FROM '^XP-([0-9]+)$')::bigint)
              FROM product_variants WHERE sku ~ '^XP-[0-9]+$'), 0) + 1,
    false);
