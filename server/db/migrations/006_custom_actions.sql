ALTER TABLE records DROP CONSTRAINT records_status_check;
ALTER TABLE records ADD CONSTRAINT records_status_check CHECK(status IN ('draft','pending','approved','rejected','completed'));
CREATE TABLE action_receipts(tenant_id uuid NOT NULL REFERENCES organizations(id),user_id text NOT NULL REFERENCES users(id),request_id uuid NOT NULL,record_id uuid NOT NULL,action_id text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,user_id,request_id));
