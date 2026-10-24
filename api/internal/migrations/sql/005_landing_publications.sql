-- pages and page_sections remain the editable draft. Only immutable
-- page_publications are served to public visitors after a publish action.
ALTER TABLE pages ADD COLUMN draft_revision BIGINT NOT NULL DEFAULT 0
    CHECK (draft_revision >= 0);

ALTER TABLE page_sections ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE page_sections ADD COLUMN deleted_by_user_id BIGINT
    REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE page_sections ADD CONSTRAINT page_sections_deleted_by_requires_date
    CHECK (deleted_by_user_id IS NULL OR deleted_at IS NOT NULL);

CREATE TABLE page_publications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    page_id BIGINT NOT NULL REFERENCES pages(id) ON DELETE RESTRICT,
    version BIGINT NOT NULL CHECK (version > 0),
    draft_revision BIGINT NOT NULL CHECK (draft_revision >= 0),
    snapshot_schema_version INTEGER NOT NULL DEFAULT 1
        CHECK (snapshot_schema_version = 1),
    snapshot JSONB NOT NULL,
    published_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (page_id, version),
    CONSTRAINT page_publications_snapshot_object
        CHECK (jsonb_typeof(snapshot) = 'object'),
    CONSTRAINT page_publications_title_string
        CHECK (
            snapshot ? 'title'
            AND jsonb_typeof(snapshot -> 'title') = 'string'
            AND btrim(snapshot ->> 'title') <> ''
        ),
    CONSTRAINT page_publications_sections_array
        CHECK (
            snapshot ? 'sections'
            AND jsonb_typeof(snapshot -> 'sections') = 'array'
        )
);

CREATE INDEX page_publications_publisher_idx
    ON page_publications (published_by_user_id);

-- Media can remain referenced only by an older published revision. This link
-- prevents deleting the underlying file metadata while history needs it.
CREATE TABLE page_publication_media (
    publication_id BIGINT NOT NULL REFERENCES page_publications(id) ON DELETE CASCADE,
    media_id BIGINT NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
    PRIMARY KEY (publication_id, media_id)
);

CREATE INDEX page_publication_media_media_idx
    ON page_publication_media (media_id);

CREATE FUNCTION reject_page_publication_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'page publications are immutable; create a new version instead';
END;
$$;

CREATE TRIGGER page_publications_append_only
BEFORE UPDATE OR DELETE ON page_publications
FOR EACH ROW EXECUTE FUNCTION reject_page_publication_change();
