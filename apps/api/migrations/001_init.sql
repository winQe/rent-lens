-- One row per HDB rental approval from data.gov.sg ("Renting Out of Flats from Jan 2021").
-- Rents are declared by flat owners and not verified by HDB.
CREATE TABLE rental_approval (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  approval_month date NOT NULL,
  town text NOT NULL,
  block text NOT NULL,
  street_name text NOT NULL,
  flat_type text NOT NULL,
  monthly_rent integer NOT NULL CHECK (monthly_rent > 0)
);

-- Budget search: filter by flat type and the 12-month window, then group by town or street.
-- INCLUDE makes it a covering index, so the scan never touches the table heap.
CREATE INDEX rental_approval_type_month_idx
  ON rental_approval (flat_type, approval_month)
  INCLUDE (town, street_name, monthly_rent);

-- Street page and rent check: one street, one flat type, a date range.
CREATE INDEX rental_approval_street_idx
  ON rental_approval (town, street_name, flat_type, approval_month)
  INCLUDE (monthly_rent, block);

-- Single-row table describing the loaded dataset. The statistics window is anchored
-- on latest_month (the newest month in the data), not on today's date, because
-- HDB publishes with a lag and results must be reproducible.
CREATE TABLE dataset_meta (
  id boolean PRIMARY KEY DEFAULT TRUE CHECK (id),
  latest_month date NOT NULL,
  row_count integer NOT NULL,
  rejected_count integer NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL
);
