# RentLens

Where can I rent an HDB flat on my budget? RentLens takes a monthly budget and a flat type, and shows which Singapore streets have most of their recent rents within it, on a ranked list and a map. For a single street it shows the typical range, a quarterly trend against all of Singapore, and whether a listing's rent is usual.

The data is HDB's "Renting Out of Flats from Jan 2021" on data.gov.sg: about 212,000 rental approvals.

![The budget page: a S$3,000 budget for a 4-room flat, 43 streets that fit, and a map of Singapore coloured by the share of rents within budget](docs/screenshot.png)

## Run it

You need Docker.

```sh
docker compose up --build
```

Then open http://localhost:8080. The first start downloads the dataset from data.gov.sg and loads it into Postgres before the API starts. If data.gov.sg cannot be reached, it loads the snapshot bundled in `data/` instead, so the app also starts offline.

The services listen on 127.0.0.1 only: the app on 8080, the API on 3000 and Postgres on 5432.

## Screenshots

**A street:** the typical range, the rent check with the listing's rent marked on the histogram, and the quarterly trend against all of Singapore.

![Yishun Ring Rd: most 4-room rents from S$2,963 to S$3,300, a S$3,400 listing marked above most rents, and the quarterly trend](docs/screenshot-street.png)

**One town:** picking Yishun, in the list or on the map, outlines it and filters the streets.

![The budget page filtered to Yishun, with Yishun outlined on the map and 7 streets that fit](docs/screenshot-town.png)

**On a phone:** the same page at 390 px wide.

<img src="docs/screenshot-phone.png" alt="The budget page on a phone, 390 px wide" width="300">

## Develop

Node 22 or later, with Yarn 4 through corepack:

```sh
corepack yarn install

docker compose up -d db
export DATABASE_URL=postgres://rentlens:rentlens@localhost:5432/rentlens
corepack yarn migrate
corepack yarn ingest
corepack yarn dev:api     # http://localhost:3000
corepack yarn dev:web     # http://localhost:5173, proxies /api to the API
```

| Task | Command |
|---|---|
| Tests (all workspaces) | `corepack yarn test` |
| Type check | `corepack yarn typecheck` |
| Lint and format check | `corepack yarn lint` |
| Format and fix | `corepack yarn format` |
| Build | `corepack yarn build` |
| Terraform check | `terraform -chdir=infra init -backend=false && terraform -chdir=infra validate` |

With `DATABASE_URL` set, the tests also run one test against the real Postgres, which checks that two overlapping loads keep a single copy of the data. Without it, that test is skipped. CI runs it against a Postgres service.

## How it works

```
packages/shared   types, zod query schemas and the data rules, shared by the API and the web app
apps/api          Express API with SQL written by hand, migrations, and the ingest job
apps/web          React app: budget page, Singapore map, street page
infra/            Terraform for AWS
data/             gzipped dataset snapshot
docs/DESIGN.md    design document
```

The browser talks to nginx, which serves the React build and forwards `/api` to the Express API. The API runs SQL against Postgres. A one-time setup job runs the migrations and, if the database is empty, the ingest. The API is versioned under `/api/v1` and only serves GET requests.

[`docs/DESIGN.md`](docs/DESIGN.md) has the diagrams, the API reference, every technical decision with its reason, the measured query performance, and the tests.

## Rules the app applies

These come from looking at the real data, not from guesses:

- **Streets are ranked by the share of rents at or below the budget, not by median rent.** Owners declare round numbers: on Yishun Ring Rd, 29 of 138 4-room rents are exactly S$3,000, so medians tie everywhere. A street "fits" when at least half of its rents are within the budget.
- **The street is the smallest unit.** A block has a median of 2 rentals a year, too few to compare, so there are no figures per block.
- **Streets with fewer than 10 rentals are "low data".** They are hidden by default, and tagged and sorted last when shown. The rent check compares with the whole town when a street has too few rentals, and says so.
- **Every figure covers the latest 12 months in the data,** not the 12 months before today, because HDB publishes with a delay. The trend is quarterly, because one street has too few rentals a month for a stable figure.

## AWS

[`infra/`](infra) holds Terraform for the AWS deployment. It passes `terraform validate`, and CI checks it, but it has not been applied to an account:

- CloudFront serves the React build from a private S3 bucket and forwards `/api/*` to API Gateway, then to a Lambda running the Express app.
- RDS Postgres sits in private subnets, reachable only from the Lambdas. RDS keeps the password in Secrets Manager.
- Each month, EventBridge Scheduler starts a Lambda that downloads the dataset to S3, and the new file starts a second Lambda inside the VPC that loads it. Splitting the ingest this way avoids a NAT gateway.
- CloudWatch alarms cover API errors, failed ingests and database storage and CPU.

The section "Not built yet for AWS" in `docs/DESIGN.md` lists what the application still needs before it can run there: reading the database secret at start-up, the two ingest entry points, Lambda packaging in CI, and separate read and write database roles.

## Accessibility and security

- Labelled controls, a keyboard path for everything the map shows ("Top towns" and the town select), text contrast of 4.5:1 or more, and axe checks in the component tests. The layout works at 390 px wide.
- The API checks every input with zod, uses parameterised SQL only, sends security headers (helmet), allows GET only from listed origins, limits the request rate, and never returns stack traces. nginx sends a Content Security Policy.

## Assumptions and limits

- **Rents are declared by flat owners, and HDB does not check them.** The app treats them as a guide and says so on the page.
- **One row is one approval** to rent out a whole flat. Room rentals are not in this dataset.
- **Towns and planning areas do not match one to one.** The map joins them with a fixed table (for example, Kallang/Whampoa covers the Kallang and Novena planning areas).
- **No login.** The data is public and read-only, and the app stores nothing about users.

`docs/DESIGN.md` lists the known limitations.

## With more time

- The AWS application changes listed above, then a deploy from CI.
- Separate read-only and write database roles.
- One end-to-end test in a real browser (Playwright), including the phone layout.
- Rent against buy, with the HDB resale dataset.

## Data

- [Renting Out of Flats from Jan 2021](https://data.gov.sg/datasets/d_c9f57187485a850908655db0e8cfe651/view), Housing & Development Board.
- [Master Plan 2025 Planning Area Boundary (No Sea)](https://data.gov.sg/datasets/d_2cc750190544007400b2cfd5d7f53209/view), Urban Redevelopment Authority.

Both are used under the [Singapore Open Data Licence version 1.0](https://data.gov.sg/open-data-licence). `data/rentals-snapshot.csv.gz` is a copy of the first dataset.
