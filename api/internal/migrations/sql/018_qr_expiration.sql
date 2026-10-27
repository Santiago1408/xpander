ALTER TABLE business_profile ADD COLUMN qr_expires_on DATE;

-- Existing active QR images predate the expiry field. Give the owner a year
-- from this migration and let them replace it with the bank's actual date.
UPDATE business_profile SET qr_expires_on =
    ((now() AT TIME ZONE 'America/La_Paz')::date + INTERVAL '1 year')::date
    WHERE qr_media_id IS NOT NULL;

ALTER TABLE business_profile ADD CONSTRAINT business_profile_qr_expiry_required
    CHECK (qr_media_id IS NULL OR qr_expires_on IS NOT NULL);
