-- A reviewed payment must retain its reviewer for the audit constraint.
ALTER TABLE order_payment_proofs
    DROP CONSTRAINT order_payment_proofs_reviewed_by_user_id_fkey;
ALTER TABLE order_payment_proofs
    ADD CONSTRAINT order_payment_proofs_reviewed_by_user_id_fkey
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;
