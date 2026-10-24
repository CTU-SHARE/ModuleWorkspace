ALTER TABLE fields DROP CONSTRAINT fields_type_check;
ALTER TABLE fields ADD CONSTRAINT fields_type_check CHECK(type IN ('text','textarea','number','date','boolean','select','json','file'));
