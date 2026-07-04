-- PostGIS must exist before the schema migration: stores.location is a
-- generated geography column. On Supabase, enabling PostGIS in the dashboard
-- first (see .env.example) makes this a no-op; elsewhere it installs it.
CREATE EXTENSION IF NOT EXISTS postgis;
