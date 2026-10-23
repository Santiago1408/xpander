-- Commercial vocabulary is created by the administrator; no categories or options are seeded.
CREATE TABLE categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT categories_slug_not_blank CHECK (btrim(slug) <> ''),
    CONSTRAINT categories_name_not_blank CHECK (btrim(name) <> '')
);

CREATE TABLE brands (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT brands_slug_not_blank CHECK (btrim(slug) <> ''),
    CONSTRAINT brands_name_not_blank CHECK (btrim(name) <> '')
);

CREATE TABLE attribute_definitions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('product', 'variant')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attribute_definitions_code_not_blank CHECK (btrim(code) <> ''),
    CONSTRAINT attribute_definitions_name_not_blank CHECK (btrim(name) <> '')
);

CREATE TABLE attribute_options (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attribute_definition_id BIGINT NOT NULL REFERENCES attribute_definitions(id) ON DELETE RESTRICT,
    value TEXT NOT NULL,
    color_hex TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, attribute_definition_id),
    CONSTRAINT attribute_options_value_not_blank CHECK (btrim(value) <> ''),
    CONSTRAINT attribute_options_color_hex_format CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE UNIQUE INDEX attribute_options_value_lower_uidx
    ON attribute_options (attribute_definition_id, lower(value));

CREATE TABLE products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    brand_id BIGINT REFERENCES brands(id) ON DELETE RESTRICT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT products_slug_not_blank CHECK (btrim(slug) <> ''),
    CONSTRAINT products_name_not_blank CHECK (btrim(name) <> '')
);

CREATE INDEX products_catalog_idx ON products (status, category_id, sort_order, id);
CREATE INDEX products_featured_idx ON products (sort_order, id) WHERE is_featured AND status = 'active';
CREATE INDEX products_brand_idx ON products (brand_id);

CREATE TABLE product_option_values (
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    attribute_definition_id BIGINT NOT NULL REFERENCES attribute_definitions(id) ON DELETE RESTRICT,
    option_id BIGINT NOT NULL,
    PRIMARY KEY (product_id, option_id),
    FOREIGN KEY (option_id, attribute_definition_id)
        REFERENCES attribute_options(id, attribute_definition_id) ON DELETE RESTRICT
);

CREATE INDEX product_option_values_definition_idx
    ON product_option_values (attribute_definition_id, option_id);

CREATE TABLE product_variants (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    sku TEXT NOT NULL UNIQUE,
    option_signature TEXT NOT NULL DEFAULT '',
    price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
    compare_at_price_minor BIGINT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, option_signature),
    CONSTRAINT product_variants_sku_not_blank CHECK (btrim(sku) <> ''),
    CONSTRAINT product_variants_compare_price CHECK (
        compare_at_price_minor IS NULL OR compare_at_price_minor >= price_minor
    )
);

CREATE INDEX product_variants_product_idx ON product_variants (product_id, sort_order, id);

CREATE TABLE variant_option_values (
    variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    attribute_definition_id BIGINT NOT NULL REFERENCES attribute_definitions(id) ON DELETE RESTRICT,
    option_id BIGINT NOT NULL,
    PRIMARY KEY (variant_id, attribute_definition_id),
    FOREIGN KEY (option_id, attribute_definition_id)
        REFERENCES attribute_options(id, attribute_definition_id) ON DELETE RESTRICT
);

CREATE INDEX variant_option_values_option_idx ON variant_option_values (option_id);

CREATE TABLE product_media (
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    media_id BIGINT NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (product_id, media_id)
);

CREATE UNIQUE INDEX product_media_one_primary_uidx ON product_media (product_id) WHERE is_primary;
CREATE INDEX product_media_order_idx ON product_media (product_id, sort_order, media_id);
CREATE INDEX product_media_media_idx ON product_media (media_id);
