CREATE TABLE import_receipts (
 tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 actor text NOT NULL, request_id uuid NOT NULL, payload_hash text NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,actor,request_id)
);
