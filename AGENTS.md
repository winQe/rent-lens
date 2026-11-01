# RentLens

A budget-first HDB rent explorer: pick a monthly budget and a flat type, and see which Singapore streets have most of their recent rents within it. Data: the HDB "Renting Out of Flats from Jan 2021" dataset on data.gov.sg.

`docs/DESIGN.md` holds the data rules (window, "fits", low data, trend, map colours), the architecture, and the reason for each technical choice. Read it before you change behaviour.

## Layout

```
packages/shared   types, zod query schemas, constants (MIN_RENTALS, FIT_SHARE, WINDOW_MONTHS), flat type and town helpers
apps/api          Express 5 API, SQL handlers, migrations, ingest job (download, parse, guarded load)
apps/web          React 19 + Vite + Tailwind v4 app, SVG map and charts
data/             gzipped dataset snapshot, used only when the database is empty and data.gov.sg cannot be reached
docs/DESIGN.md    design document
```

In `apps/api/src`: `handlers/` (one file per endpoint, all SQL), `http/app.ts` (routes, middleware, errors), `ingest/` (source, parse, load), `db/` (the `Db` interface, the `pg` pool, the migration runner), `cli/` (migrate and ingest entry points).

## Commands

Run from the repo root. Use `corepack yarn`, never npm.

| Task | Command |
|---|---|
| Install | `corepack yarn install` |
| Run everything | `docker compose up --build`, then http://localhost:8080 |
| Tests | `corepack yarn test` |
| Type check | `corepack yarn typecheck` |
| Lint and format check | `corepack yarn lint` |
| Format and fix | `corepack yarn format` |
| Build | `corepack yarn build` |

Development without Docker for the app:

```sh
docker compose up -d db
export DATABASE_URL=postgres://rentlens:rentlens@localhost:5432/rentlens
corepack yarn migrate
corepack yarn ingest            # --force loads data that is older or much smaller than what is loaded
corepack yarn dev:api           # port 3000
corepack yarn dev:web           # port 5173, proxies /api to API_URL (default http://localhost:3000)
```

API environment: `DATABASE_URL` (required), `PORT` (3000), `CORS_ORIGINS` (comma-separated, default `http://localhost:5173`), `LOG_LEVEL` (`info`), `MIGRATIONS_DIR`, `SNAPSHOT_PATH`.

Before you finish a change, run `corepack yarn lint`, `corepack yarn typecheck` and `corepack yarn test`. All three must pass.

## Conventions

- **TypeScript 7** (the Go compiler) is used for type checks only. Vite, Vitest, tsx and esbuild strip types themselves. `noUncheckedIndexedAccess` is on, so `rows[0]` may be `undefined`; use `!` only where the code has already checked.
- **Biome** is the only linter and formatter (`biome.jsonc`): 2 spaces, single quotes, 150-character lines, sorted imports and sorted Tailwind classes. Suppress a rule only on one line, with a reason: `// biome-ignore lint/<group>/<rule>: <why>`.
- **Libraries before hand-written helpers:** TanStack Query for server data, `use-debounce`, `clsx` for conditional classes, zod for input checks.
- **Validation lives in `packages/shared/src/schemas.ts`,** so the API and the web app use the same schemas and types. Add a query parameter there first.
- **API routes are under `/api/v1`.** A breaking change goes to `/api/v2`. Every error is JSON: `{ "error": "..." }`. Throw `HttpError(status, message)` from a handler for a 4xx; anything else becomes a 500 with no detail (503 when Postgres cannot be reached).
- **Handlers depend only on the `Db` interface** (`query`, `exec`, `transaction`) in `apps/api/src/db/types.ts`, never on `pg` directly. Tests pass PGlite through the same interface.

### SQL

SQL is written by hand in `apps/api/src/handlers/` and follows the Mozilla SQL style guide (https://docs.telemetry.mozilla.org/concepts/sql_style):

- uppercase keywords, lowercase function names and identifiers;
- explicit `AS` for every alias and an explicit join type (`CROSS JOIN data_window`, never a comma);
- root keywords on their own line, one argument per line, `AND` and `OR` at the start of a line, trailing commas;
- CTEs, not nested subqueries. The one exception is the `LATERAL` join in the trend query (`streetDetail.ts`), which a comment explains with a measurement.

Always pass user input as parameters (`$1`, `$2`, ...). Only code constants may be put into the SQL text. Every statistic covers the window in `WINDOW_CTE` (`handlers/common.ts`), which ends at the newest month in the data, not at today's date.

Check a query change with `EXPLAIN (ANALYZE)` on the full dataset, not only the tests: the "Query performance" section of `docs/DESIGN.md` has the current numbers and indexes.

### Database

- **Migrations** are `.sql` files in `apps/api/migrations/`, applied in name order and recorded by file name. Never edit an applied migration's behaviour; add a new numbered file.
- **The ingest** replaces the whole table in one transaction, under `LOCK TABLE rental_approval IN EXCLUSIVE MODE`, then runs `VACUUM ANALYZE`. Keep the lock: without it, two overlapping loads store every row twice.
- **The API connects with `jit=off`.** With JIT on, Postgres spends about 100 ms compiling the percentile queries, which then run in about 7 ms.

### Web

- All search state is in the URL (`useBudgetSearch.ts`). The budget is snapped to the slider's step and range.
- Use theme tokens from `@theme` in `apps/web/src/styles.css` (colours, `text-hero`, `text-amount`, `max-w-page`, the map's `map-0` to `map-4`) instead of arbitrary values like `text-[28px]`. Use Tailwind's spacing steps (`px-4.5` is 18 px).
- Pages hold state and queries; components in `components/` take plain props.
- `apps/web/src/data/planning-areas.json` is generated. To change the map, edit `scripts/build-map.mjs` and run `corepack yarn workspace @rent-lens/web build:map`.
- Accessibility is part of done: real labels, keyboard paths for anything the map or a chart shows, and text contrast of 4.5:1 or more. The component tests run axe.

## Tests

- **API tests** use PGlite (Postgres in WebAssembly) with the real migrations, against `apps/api/test/fixtures/rentals.csv`. Its expected numbers were worked out by hand. When a test number changes, work out why before you update it.
- **`concurrency.test.ts`** runs only when `DATABASE_URL` points at a real Postgres. PGlite has a single connection, so it cannot show the race the ingest lock prevents. CI must provide Postgres and set `DATABASE_URL`.
- **Web tests** use Vitest, Testing Library and axe in jsdom. jsdom has no `ResizeObserver` and does not compute colour contrast, so the map's label scaling and contrast need a check in a real browser.
- For a bug fix, write a test that fails without the fix first.
