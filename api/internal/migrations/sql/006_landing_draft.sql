-- Create only the editable home page shell. No section or media is published.
INSERT INTO pages (slug, title, is_published)
VALUES ('inicio', 'XPANDER', FALSE)
ON CONFLICT (slug) DO NOTHING;
