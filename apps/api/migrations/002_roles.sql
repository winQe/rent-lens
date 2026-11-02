-- Least privilege: the API can only read, and only the ingest can write.
--
-- Group roles hold the privileges. Login roles are members of them and start without a
-- password, so they cannot log in until the `roles` command sets one from the environment.
-- Roles belong to the whole cluster, not one database, so each is created only if missing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rentlens_reader') THEN
    CREATE ROLE rentlens_reader NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rentlens_writer') THEN
    CREATE ROLE rentlens_writer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rentlens_api') THEN
    CREATE ROLE rentlens_api LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rentlens_ingest') THEN
    CREATE ROLE rentlens_ingest LOGIN;
  END IF;
END
$$;

GRANT rentlens_reader TO rentlens_api;
GRANT rentlens_writer TO rentlens_ingest;

-- The API reads both tables and nothing else.
GRANT SELECT ON rental_approval, dataset_meta TO rentlens_reader;

-- The ingest replaces the rentals (DELETE also allows the EXCLUSIVE table lock), upserts the
-- metadata row, and runs VACUUM ANALYZE after the load (MAINTAIN, new in Postgres 17).
GRANT SELECT, INSERT, DELETE, MAINTAIN ON rental_approval TO rentlens_writer;
GRANT USAGE ON SEQUENCE rental_approval_id_seq TO rentlens_writer;
GRANT SELECT, INSERT, UPDATE ON dataset_meta TO rentlens_writer;
