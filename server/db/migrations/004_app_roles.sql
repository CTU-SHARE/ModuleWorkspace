CREATE TABLE app_roles(tenant_id uuid NOT NULL,app_id uuid NOT NULL,role text NOT NULL CHECK(role IN ('owner','admin','editor','viewer')),PRIMARY KEY(app_id,role),FOREIGN KEY(tenant_id,app_id) REFERENCES apps(tenant_id,id) ON DELETE CASCADE);
CREATE FUNCTION sync_app_roles() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM app_roles WHERE app_id=NEW.id;
 INSERT INTO app_roles SELECT NEW.tenant_id,NEW.id,value FROM jsonb_array_elements_text(coalesce(NEW.config->'roles','["owner","admin","editor","viewer"]'::jsonb)) ON CONFLICT DO NOTHING;
 INSERT INTO app_roles VALUES(NEW.tenant_id,NEW.id,'owner'),(NEW.tenant_id,NEW.id,'admin') ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_app_roles AFTER INSERT OR UPDATE OF config ON apps FOR EACH ROW EXECUTE FUNCTION sync_app_roles();
INSERT INTO app_roles SELECT a.tenant_id,a.id,r FROM apps a CROSS JOIN unnest(ARRAY['owner','admin','editor','viewer']) r;
GRANT SELECT ON app_roles TO hasura;
