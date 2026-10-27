-- Store logos the owner can replace from "Datos del negocio". While none is
-- chosen, the storefront keeps the logo files bundled with the site.
DO $$
DECLARE item record;
BEGIN
    -- The purpose CHECK from migration 021 has a generated name; find it by its definition.
    FOR item IN SELECT conname FROM pg_constraint
        WHERE conrelid = 'media'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%purpose%'
    LOOP
        EXECUTE format('ALTER TABLE media DROP CONSTRAINT %I', item.conname);
    END LOOP;
END $$;
ALTER TABLE media ADD CONSTRAINT media_purpose_check
    CHECK (purpose IN ('photo', 'qr', 'logo'));

ALTER TABLE business_profile
    ADD COLUMN logo_wordmark_media_id BIGINT REFERENCES media(id) ON DELETE SET NULL,
    ADD COLUMN logo_mark_media_id BIGINT REFERENCES media(id) ON DELETE SET NULL;
