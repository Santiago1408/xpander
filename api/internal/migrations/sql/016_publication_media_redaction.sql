-- Explicit permanent media deletion may redact only the publication snapshot.
-- The version, publisher, timestamp, and page remain unchanged.
CREATE OR REPLACE FUNCTION reject_page_publication_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND current_setting('xpander.allow_media_redaction', true) = 'on'
       AND NEW.id = OLD.id AND NEW.page_id = OLD.page_id
       AND NEW.version = OLD.version AND NEW.draft_revision = OLD.draft_revision
       AND NEW.snapshot_schema_version = OLD.snapshot_schema_version
       AND NEW.published_by_user_id IS NOT DISTINCT FROM OLD.published_by_user_id
       AND NEW.published_at = OLD.published_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'page publications are immutable; create a new version instead';
END;
$$;
