-- 0002_app_role.sql
-- Least privilege. The application does not connect as a superuser, because the
-- application does not need to drop your tables and one day, given the chance,
-- it would.
--
-- The app role can read and write rows. It cannot create, alter, or drop schema
-- objects. Migrations are run by a separate, more privileged role out of band.
--
-- The password here is a placeholder for local development only. Real deployments
-- inject it from a secret store; see docs/adr/0004-secrets-management.md.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ticketing_app') THEN
        CREATE ROLE ticketing_app LOGIN PASSWORD 'app_local_dev_only';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE ticketing TO ticketing_app;
GRANT USAGE ON SCHEMA public TO ticketing_app;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA public
    TO ticketing_app;

-- Future tables created by the migrator inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ticketing_app;
