ALTER TABLE records ADD COLUMN parent_id uuid;
ALTER TABLE records ADD CONSTRAINT records_parent_fk FOREIGN KEY(tenant_id,collection_id,parent_id) REFERENCES records(tenant_id,collection_id,id) ON DELETE RESTRICT;
ALTER TABLE records ADD CONSTRAINT no_self_parent CHECK(parent_id IS NULL OR parent_id<>id);
CREATE INDEX record_parent ON records(tenant_id,collection_id,parent_id);
