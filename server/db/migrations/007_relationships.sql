ALTER TABLE fields DROP CONSTRAINT fields_type_check;
ALTER TABLE fields ADD CONSTRAINT fields_type_check CHECK(type IN ('text','textarea','number','date','boolean','select','json','file','relation'));
CREATE TABLE record_links(tenant_id uuid NOT NULL,field_id uuid NOT NULL,source_id uuid NOT NULL,target_id uuid NOT NULL,exclusive boolean NOT NULL DEFAULT false,
 PRIMARY KEY(field_id,source_id,target_id),FOREIGN KEY(tenant_id,field_id) REFERENCES fields(tenant_id,id),
 FOREIGN KEY(tenant_id,source_id) REFERENCES records(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,target_id) REFERENCES records(tenant_id,id) ON DELETE RESTRICT);
CREATE UNIQUE INDEX exclusive_relation_target ON record_links(field_id,target_id) WHERE exclusive;
CREATE INDEX links_target ON record_links(tenant_id,target_id);
