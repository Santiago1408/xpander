ALTER TABLE media ADD COLUMN purpose TEXT NOT NULL DEFAULT 'photo'
    CHECK (purpose IN ('photo', 'qr'));

UPDATE media SET purpose='qr'
WHERE id IN (SELECT qr_media_id FROM business_profile WHERE qr_media_id IS NOT NULL);

CREATE TABLE media_variants (
    media_id BIGINT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    size_key TEXT NOT NULL CHECK (size_key IN ('thumb', 'card', 'detail')),
    storage_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL CHECK (mime_type = 'image/webp'),
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
    width_px INTEGER NOT NULL CHECK (width_px > 0),
    height_px INTEGER NOT NULL CHECK (height_px > 0),
    PRIMARY KEY (media_id, size_key)
);
