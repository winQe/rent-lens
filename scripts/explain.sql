-- Reproduces the measurements in "Query performance" (docs/DESIGN.md) on the local stack:
--
--   docker compose exec -T db psql -U rentlens -d rentlens -f - < scripts/explain.sql
--
-- The queries are the API's own (apps/api/src/handlers/streets.ts and streetDetail.ts), with the
-- parameters filled in: 4-room, a S$3,000 budget, and Yishun Ring Rd for the trend.

-- The API connects with jit=off; run once with this line removed to see the JIT cost.
SET jit = off;

\echo 'Streets ranked by share of rents within S$3,000 (4-room):'
EXPLAIN (ANALYZE, BUFFERS)
WITH data_window AS (
  SELECT
    (latest_month - INTERVAL '11 months')::date AS from_month,
    latest_month AS to_month
  FROM dataset_meta
),
street_stats AS (
  SELECT
    r.town,
    r.street_name,
    count(*)::int AS rentals,
    (count(*) FILTER (WHERE r.monthly_rent <= 3000))::int AS within_budget,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY r.monthly_rent) AS p25,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY r.monthly_rent) AS median,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY r.monthly_rent) AS p75
  FROM rental_approval AS r
  CROSS JOIN data_window
  WHERE
    r.flat_type = '4-ROOM'
    AND r.approval_month BETWEEN data_window.from_month AND data_window.to_month
  GROUP BY
    r.town,
    r.street_name
)
SELECT
  town,
  street_name,
  rentals,
  within_budget
FROM street_stats
WHERE rentals >= 10
ORDER BY
  within_budget::float8 / rentals DESC,
  rentals DESC,
  street_name
LIMIT 12;

\echo 'Quarterly trend for Yishun Ring Rd against Singapore (4-room):'
EXPLAIN (ANALYZE, BUFFERS)
WITH quarters AS (
  SELECT (date_trunc('quarter', latest_month + INTERVAL '1 month') - make_interval(months => 3 * (g + 1)))::date AS quarter_start
  FROM dataset_meta
  CROSS JOIN generate_series(0, 7) AS g
)
SELECT
  to_char(quarters.quarter_start, 'YYYY "Q"Q') AS quarter,
  street.median AS street_median,
  national.median AS national_median
FROM quarters
LEFT JOIN LATERAL (
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY r.monthly_rent) AS median
  FROM rental_approval AS r
  WHERE
    r.town = 'YISHUN'
    AND r.street_name = 'YISHUN RING RD'
    AND r.flat_type = '4-ROOM'
    AND r.approval_month >= quarters.quarter_start
    AND r.approval_month < quarters.quarter_start + INTERVAL '3 months'
) AS street
  ON TRUE
LEFT JOIN LATERAL (
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY r.monthly_rent) AS median
  FROM rental_approval AS r
  WHERE
    r.flat_type = '4-ROOM'
    AND r.approval_month >= quarters.quarter_start
    AND r.approval_month < quarters.quarter_start + INTERVAL '3 months'
) AS national
  ON TRUE
ORDER BY quarters.quarter_start;
