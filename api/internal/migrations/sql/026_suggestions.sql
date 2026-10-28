-- Suggestion box on the landing: customers leave their name, their mobile
-- number and the garments they would like to find in the store. The owner
-- reviews them before restocking.
CREATE TABLE suggestions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_name TEXT NOT NULL CHECK (btrim(customer_name) <> '' AND char_length(customer_name) <= 80),
    -- Customers are in Bolivia: 8-digit mobile numbers, stored without the country code.
    customer_phone TEXT NOT NULL CHECK (customer_phone ~ '^[67][0-9]{7}$'),
    message TEXT NOT NULL CHECK (btrim(message) <> '' AND char_length(message) <= 1000),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX suggestions_status_created_idx ON suggestions (status, created_at DESC);
