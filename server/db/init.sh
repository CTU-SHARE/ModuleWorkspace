#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -v core_pass="$CORE_DB_PASSWORD" -v hasura_pass="$HASURA_DB_PASSWORD" -v logto_pass="$LOGTO_DB_PASSWORD" -v n8n_pass="$N8N_DB_PASSWORD" <<'SQL'
CREATE USER sharebase PASSWORD :'core_pass';
CREATE USER hasura PASSWORD :'hasura_pass';
CREATE USER logto WITH CREATEROLE PASSWORD :'logto_pass';
CREATE USER n8n PASSWORD :'n8n_pass';
CREATE DATABASE sharebase OWNER sharebase;
CREATE DATABASE hasura OWNER hasura;
CREATE DATABASE logto OWNER logto;
CREATE DATABASE n8n OWNER n8n;
SQL
