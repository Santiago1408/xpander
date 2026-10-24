-- Existing migrations are immutable. Switch authentication identity from email
-- to a required username while retaining email only as optional contact data.
ALTER TABLE users ADD COLUMN username TEXT;

-- No users are seeded by the application, but preserve any manually created
-- users instead of blocking an upgrade. They can rename this temporary handle.
UPDATE users SET username = 'usuario_' || id::text WHERE username IS NULL;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_format
    CHECK (username ~ '^[a-z][a-z0-9_-]{2,31}$');
CREATE UNIQUE INDEX users_username_lower_uidx ON users (lower(username));

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT users_email_not_blank;
ALTER TABLE users ADD CONSTRAINT users_email_optional_nonblank
    CHECK (email IS NULL OR btrim(email) <> '');
