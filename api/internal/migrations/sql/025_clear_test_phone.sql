-- Migration 017 seeded a development phone number. A store being set up starts
-- without one; a number the owner already entered is left untouched.
UPDATE business_profile SET phone = '', updated_at = now()
WHERE id AND phone = '+591 70782380';
