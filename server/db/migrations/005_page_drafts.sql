ALTER TABLE app_pages ADD COLUMN draft_config jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(draft_config)='object');
