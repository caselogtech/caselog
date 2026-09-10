-- Separate cluster login roles from the application's tenant role and schema owner.
\getenv runtime_password DATABASE_RUNTIME_PASSWORD
\getenv job_password DATABASE_JOB_PASSWORD
SELECT 'CREATE ROLE caselog_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'caselog_runtime') \gexec
SELECT 'CREATE ROLE caselog_jobs LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'caselog_jobs') \gexec
ALTER ROLE caselog_runtime PASSWORD :'runtime_password';
ALTER ROLE caselog_jobs PASSWORD :'job_password';
GRANT caselog_app TO caselog_runtime;
CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION caselog_jobs;
-- pg-boss checks CREATE on the database even when its schema already exists
-- during first-time installation. This permits schemas, not new databases.
GRANT CREATE ON DATABASE caselog TO caselog_jobs;
REVOKE ALL ON SCHEMA pgboss FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
