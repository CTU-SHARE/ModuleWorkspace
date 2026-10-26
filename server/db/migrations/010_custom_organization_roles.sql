CREATE TABLE organization_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  base_role text NOT NULL CHECK (base_role IN ('admin','editor','viewer')),
  permissions jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(permissions)='array'),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX organization_roles_name_unique ON organization_roles(tenant_id,lower(btrim(name)));
ALTER TABLE memberships ADD COLUMN custom_role_id uuid;
ALTER TABLE memberships ADD CONSTRAINT memberships_custom_role_fk
  FOREIGN KEY(tenant_id,custom_role_id) REFERENCES organization_roles(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE memberships ADD CONSTRAINT memberships_owner_not_custom CHECK(role <> 'owner' OR custom_role_id IS NULL);
CREATE INDEX memberships_custom_role ON memberships(tenant_id,custom_role_id) WHERE custom_role_id IS NOT NULL;
-- No Hasura grants: custom-role traffic must pass the Core policy guard.
