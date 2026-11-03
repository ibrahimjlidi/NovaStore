# NovaStore — Production inventory management

NovaStore is a bilingual (Arabic RTL / French) inventory application for clothing retailers. The `production` branch uses PostgreSQL-backed records and an Express API; product quantities are calculated exclusively from inventory movements.

## Stack

- React, TypeScript, Vite, Tailwind CSS, and Recharts
- Express API, deployed as a Vercel Node.js function
- PostgreSQL with transactional schema migrations
- Auth.js credentials sign-in with bcrypt password hashes and encrypted JWT sessions

## Prerequisites

- Node.js 20.19.x or 22.12+ and npm
- A PostgreSQL database (Neon is one managed option)
- An Auth.js secret
- Optional: a Resend account and verified sender for invitation and password-reset emails
- A Vercel account for deployment

## Local setup

1. Check out the `production` branch, install dependencies, and create a private environment file:

   ```powershell
   git switch production
   npm.cmd install
   Copy-Item .env.example .env.local
   ```

2. Set these values in `.env.local`:

   - `DATABASE_URL` — SSL-enabled PostgreSQL connection string
   - `AUTH_SECRET` — unique random secret of at least 32 characters; generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
   - `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` — first store administrator; use a unique password with at least 12 characters
   - `STORE_NAME` and `STORE_CITY` — initial store details
   - `APP_URL=http://localhost:5173`

   Email delivery is optional. Configure `RESEND_API_KEY` and a verified `EMAIL_FROM` address to email invitations and password-reset links. Without these values, administrators can copy and share one-time links from **Users and roles**.

3. Apply migrations and start the app:

   ```powershell
   npm.cmd run db:migrate
   npm.cmd run dev
   ```

   Open `http://localhost:5173`. Migrations create the store and bootstrap administrator when the bootstrap variables are set. Public sign-up is disabled; administrators invite storekeepers and viewers.

4. Existing Clerk-era team members have no password after migration. Sign in as the bootstrap administrator, open **Users and roles**, and create a one-time reset link for each existing member. Pending Clerk invitations are revoked by migration 002 and must be re-created.

5. Add products and stock using the product form, or import [`imports/products-template.csv`](./imports/products-template.csv). Opening quantities are imported as incoming movements, not editable stock totals.

For a fresh local store, optionally load the fictional Tunisian clothing-store dataset:

```powershell
npm.cmd run db:seed-demo
```

This creates 25 demo products, stock variants and movements, five suppliers, and five purchase orders. The seed is transactional and skips without changing data if the store already has any products. Do not use this sample data in production.

## Authentication and account links

- Auth.js credentials sign-in uses a database email/password record, bcrypt password hashes, and an encrypted, 12-hour JWT cookie. Store membership and role are checked against PostgreSQL on each API request.
- Password reset and invitation tokens are stored as SHA-256 hashes, expire, and can only be used once. Password changes invalidate existing sessions.
- Auth.js Credentials does not provide account registration or password recovery by itself. NovaStore manages invitation acceptance and password-reset records in PostgreSQL.
- Email is optional. If Resend is not configured, administrators receive the one-time link in the team UI and must share it securely. The self-service “forgot password” form only sends email when Resend is configured.
- The Express adapter `@auth/express` is currently experimental; pin and test upgrades before production rollout.

## Vercel deployment

1. Push the `production` branch to GitHub and import the repository in Vercel. Use the Vite preset, build command `npm run build`, and output directory `dist`.
2. Add environment variables in Vercel for Production (and Preview, if applicable):

   | Variable | Purpose |
   | --- | --- |
   | `DATABASE_URL` | Managed PostgreSQL connection string |
   | `AUTH_SECRET` | Unique random secret of at least 32 characters |
   | `BOOTSTRAP_ADMIN_EMAIL` | First administrator email |
   | `BOOTSTRAP_ADMIN_PASSWORD` | First administrator password (at least 12 characters) |
   | `STORE_NAME` | Initial store name (optional; defaults to NovaStore) |
   | `STORE_CITY` | Initial store city (optional; defaults to Tunis) |
   | `APP_URL` | Deployed origin, e.g. `https://your-store.vercel.app` |
   | `RESEND_API_KEY` | Optional Resend API key for account emails |
   | `EMAIL_FROM` | Optional verified sender address for account emails |

3. Apply migrations once from a trusted local machine configured with the production `DATABASE_URL` and the bootstrap administrator variables:

   ```powershell
   npm.cmd run db:migrate
   ```

4. Deploy the `production` branch. Vercel serves `/api/*` through the Express function and rewrites browser routes to the React app.

Keep database and authentication secrets in encrypted environment settings, not Git or `VITE_` variables. Do not use a personal development database for production.

## Workflows

- **Products:** search, filter by category/size/color/stock status, maintain variants and thresholds, and archive products without removing movement history.
- **Stock movements:** create incoming, outgoing, or signed adjustment entries. The API locks the variant and rejects any operation that would make stock negative.
- **Purchase orders:** draft, send, then receive orders. Receiving is transactional and creates one incoming movement for every order line.
- **Alerts and reports:** low/out-of-stock products, inventory valuation, period-based movement charts, CSV export, and browser print/PDF.
- **Users and roles:** invite members and assign Admin, Storekeeper, or Viewer access. The API enforces the same role boundaries as navigation.
- **Languages and theme:** Arabic is the default, with a French switch and light/dark mode.

## Validation

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd audit
```

### End-to-end tests

Unit tests run with `npm.cmd test:unit` and need no database. API and browser tests use Playwright and require a separate, disposable PostgreSQL database; the E2E setup creates a uniquely named test store and removes only that store after the run. Never point `E2E_DATABASE_URL` at production or a database containing data you need.

For an empty database, the E2E setup applies the normal migrations. For a Neon schema-only branch, add `E2E_SCHEMA_ONLY=true`; setup first verifies the expected current schema, then records the migrations already represented by that schema. This avoids applying table-creation migrations a second time and does not copy production rows.

Create a private `.env.e2e` file in the repository root with a dedicated database URL:

```dotenv
E2E_DATABASE_URL=postgresql://user:password@host/database?sslmode=require
E2E_SCHEMA_ONLY=true
```

Alternatively, set `E2E_DATABASE_URL` in the current PowerShell session. The Playwright config refuses to start if the URL matches `DATABASE_URL` from the process environment, `.env.local`, or `.env`; it does not fall back to `DATABASE_URL`. `.env.e2e` is ignored by Git.

Install the Playwright browser once, then run all API and browser workflows:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

The test runner starts an API and Vite server against the E2E database, disables email delivery, and tests sign-in, role permissions, product and stock workflows, suppliers and purchase orders, imports, reports, and team account links. Playwright reports and traces are saved under the ignored `playwright-report` and `test-results` directories. For interactive debugging, use `npm.cmd run test:e2e:ui`.

Run the complete local checks with:

```powershell
npm.cmd run test:unit
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```
