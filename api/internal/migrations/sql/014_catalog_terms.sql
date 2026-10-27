-- Styles and audiences become administrator-managed vocabulary. Existing product
-- labels remain readable and are registered as choices without losing products.
CREATE TABLE catalog_terms (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('style', 'audience')),
    name TEXT NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (kind, name)
);

UPDATE products SET style_label=upper(regexp_replace(btrim(style_label), '[[:space:]]+', ' ', 'g'))
    WHERE style_label <> '';
UPDATE products SET audience_label=upper(regexp_replace(btrim(audience_label), '[[:space:]]+', ' ', 'g'))
    WHERE audience_label <> '';

INSERT INTO catalog_terms (kind, name)
SELECT DISTINCT 'style', style_label FROM products WHERE style_label <> ''
ON CONFLICT DO NOTHING;
INSERT INTO catalog_terms (kind, name)
SELECT DISTINCT 'audience', audience_label FROM products WHERE audience_label <> ''
ON CONFLICT DO NOTHING;
