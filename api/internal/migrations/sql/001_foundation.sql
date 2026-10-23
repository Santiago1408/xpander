-- Administrative users, branches, and editable public content.
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_not_blank CHECK (btrim(email) <> ''),
    CONSTRAINT users_display_name_not_blank CHECK (btrim(display_name) <> '')
);

CREATE UNIQUE INDEX users_email_lower_uidx ON users (lower(email));

CREATE TABLE user_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash BYTEA NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT user_sessions_token_hash_length CHECK (octet_length(token_hash) = 32),
    CONSTRAINT user_sessions_expiry CHECK (expires_at > created_at)
);

CREATE INDEX user_sessions_user_idx ON user_sessions (user_id);
CREATE INDEX user_sessions_expiry_idx ON user_sessions (expires_at);

CREATE TABLE branches (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    address TEXT,
    pickup_instructions TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT branches_code_not_blank CHECK (btrim(code) <> ''),
    CONSTRAINT branches_name_not_blank CHECK (btrim(name) <> '')
);

CREATE TABLE user_branch_access (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id BIGINT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, branch_id)
);

CREATE INDEX user_branch_access_branch_idx ON user_branch_access (branch_id);

CREATE TABLE site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT site_settings_key_not_blank CHECK (btrim(key) <> '')
);

CREATE TABLE media (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
    source_type TEXT NOT NULL CHECK (source_type IN ('local', 'external')),
    storage_key TEXT,
    external_url TEXT,
    mime_type TEXT,
    alt_text TEXT,
    file_size_bytes BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
    width_px INTEGER CHECK (width_px IS NULL OR width_px > 0),
    height_px INTEGER CHECK (height_px IS NULL OR height_px > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT media_one_source CHECK (
        (source_type = 'local' AND storage_key IS NOT NULL AND btrim(storage_key) <> '' AND external_url IS NULL)
        OR (source_type = 'external' AND external_url IS NOT NULL AND btrim(external_url) <> '' AND storage_key IS NULL)
    )
);

CREATE TABLE pages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    seo_title TEXT,
    seo_description TEXT,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pages_slug_not_blank CHECK (btrim(slug) <> ''),
    CONSTRAINT pages_title_not_blank CHECK (btrim(title) <> '')
);

CREATE TABLE page_sections (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    page_id BIGINT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    section_key TEXT NOT NULL,
    section_type TEXT NOT NULL,
    title TEXT,
    body TEXT,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (page_id, section_key),
    CONSTRAINT page_sections_key_not_blank CHECK (btrim(section_key) <> ''),
    CONSTRAINT page_sections_type_not_blank CHECK (btrim(section_type) <> ''),
    CONSTRAINT page_sections_config_object CHECK (jsonb_typeof(config) = 'object')
);

CREATE INDEX page_sections_order_idx ON page_sections (page_id, sort_order, id);

CREATE TABLE page_section_media (
    section_id BIGINT NOT NULL REFERENCES page_sections(id) ON DELETE CASCADE,
    media_id BIGINT NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
    role TEXT NOT NULL DEFAULT 'content',
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (section_id, media_id),
    CONSTRAINT page_section_media_role_not_blank CHECK (btrim(role) <> '')
);

CREATE INDEX page_section_media_order_idx ON page_section_media (section_id, sort_order, media_id);
CREATE INDEX page_section_media_media_idx ON page_section_media (media_id);
