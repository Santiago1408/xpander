-- Orders can be picked up at a branch or delivered. Delivery details and the
-- delivery cost are coordinated by WhatsApp; stock still leaves the chosen branch.
ALTER TABLE orders ADD COLUMN delivery_method TEXT NOT NULL DEFAULT 'pickup'
    CHECK (delivery_method IN ('pickup', 'delivery'));

-- The owner may cancel a pending order whose payment has not been verified.
ALTER TABLE orders ADD COLUMN cancelled_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
