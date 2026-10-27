CREATE TABLE business_profile (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    phone TEXT NOT NULL DEFAULT '',
    social_links JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(social_links) = 'object'),
    qr_media_id BIGINT REFERENCES media(id) ON DELETE RESTRICT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO business_profile (id, phone) VALUES (TRUE, '+591 70782380');
