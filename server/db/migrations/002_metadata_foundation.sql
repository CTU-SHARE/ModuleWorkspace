ALTER TABLE apps ADD COLUMN icon text NOT NULL DEFAULT 'Layers3';
ALTER TABLE apps ADD COLUMN config jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(config)='object');
ALTER TABLE apps ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE apps ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE collections ADD COLUMN config jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(config)='object');
ALTER TABLE collections ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE collections ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE fields ADD COLUMN config jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(config)='object');
ALTER TABLE fields ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE fields ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE FUNCTION metadata_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER apps_revision BEFORE UPDATE ON apps FOR EACH ROW EXECUTE FUNCTION metadata_revision();
CREATE TRIGGER collections_revision BEFORE UPDATE ON collections FOR EACH ROW EXECUTE FUNCTION metadata_revision();
CREATE TRIGGER fields_revision BEFORE UPDATE ON fields FOR EACH ROW EXECUTE FUNCTION metadata_revision();
CREATE TABLE app_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, app_id uuid NOT NULL,
  name text NOT NULL, slug text NOT NULL, config jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(config)='object'),
  published boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(app_id,slug), FOREIGN KEY(tenant_id,app_id) REFERENCES apps(tenant_id,id)
);
CREATE TRIGGER pages_revision BEFORE UPDATE ON app_pages FOR EACH ROW EXECUTE FUNCTION metadata_revision();
CREATE INDEX collections_app ON collections(tenant_id,app_id);
CREATE INDEX fields_collection ON fields(tenant_id,collection_id,position);
CREATE INDEX records_owner ON records(tenant_id,created_by);
-- Hasura remains read-only for business records and schema metadata.
REVOKE INSERT,UPDATE,DELETE ON apps,collections,fields,record_values,records FROM hasura;

-- Archive metadata without dropping business values; IDs/keys remain reserved.
ALTER TABLE collections ADD COLUMN key text NOT NULL DEFAULT ('collection_' || replace(gen_random_uuid()::text,'-',''));
CREATE UNIQUE INDEX collection_key ON collections(app_id,key);
ALTER TABLE collections ADD COLUMN archived_at timestamptz;
ALTER TABLE fields ADD COLUMN archived_at timestamptz;
