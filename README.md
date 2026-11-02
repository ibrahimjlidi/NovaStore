# NovaStore — Production inventory management

NovaStore is a bilingual (Arabic RTL / French) inventory application for clothing retailers. Unlike the demo on `main`, this branch uses persistent PostgreSQL data, Clerk sign-in, and a Node.js API. It starts with an empty inventory; product quantities are calculated exclusively from inventory movements.

## Stack

- React, TypeScript, Vite, Tailwind CSS, and Recharts
- Express API, deployed as a Vercel Node.js function
- PostgreSQL with transactional migrations
- Clerk authentication and invitation-based store membership

## Prerequisites

- Node.js 20.19.x or 22.12+ and npm
- A PostgreSQL database (Neon is a managed option)
- A Clerk application with email sign-in enabled
- A Vercel account for deployment

## Local setup

1. Check out the `production` branch and install packages:

   ```powershell
   git switch production
   npm.cmd install
   ```

2. Create a Clerk application and copy its publishable key and secret key. In Clerk, turn off public sign-up if access should be invitation-only. Add `http://localhost:5173` and the eventual Vercel URL to the application's allowed origins.

3. Create a PostgreSQL database. Copy `.env.example` to `.env` and set:

   - `DATABASE_URL` — the provider's SSL-enabled PostgreSQL connection string
   - `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` — from the Clerk dashboard
   - `BOOTSTRAP_ADMIN_CLERK_USER_ID` — the Clerk user ID of the first store administrator
   - `STORE_NAME` and `STORE_CITY` — the store created for that administrator
   - `APP_URL=http://localhost:5173`

   Keep `.env` private; it is ignored by Git. Never put the Clerk secret or database URL in a `VITE_` variable.

4. Apply the schema, then start the app:

   ```powershell
   npm.cmd run db:migrate
   npm.cmd run dev
   ```

   Open `http://localhost:5173`. The first sign-in using the configured Clerk user ID provisions the store administrator. Invite additional users from **Users and roles**; invited users must sign in with the invited, verified email address.

5. Add products and stock using the product form, or use **Import CSV** with [`imports/products-template.csv`](./imports/products-template.csv). Opening quantities are imported as incoming movements, not editable stock totals.

## Vercel deployment

1. Push the `production` branch to GitHub and import the repository in Vercel. Set the project root to `./`, framework preset to **Vite**, build command to `npm run build`, and output directory to `dist`.
2. Add these environment variables to Vercel for Production (and Preview if needed):

   | Variable | Purpose |
   | --- | --- |
   | `DATABASE_URL` | Managed PostgreSQL connection string |
   | `CLERK_SECRET_KEY` | Server-side Clerk key |
   | `VITE_CLERK_PUBLISHABLE_KEY` | Public Clerk key, available during the Vite build |
   | `BOOTSTRAP_ADMIN_CLERK_USER_ID` | Clerk ID of the first administrator |
   | `STORE_NAME` | Initial store name (optional; defaults to NovaStore) |
   | `STORE_CITY` | Initial store city (optional; defaults to Tunis) |
   | `APP_URL` | The deployed origin, for example `https://your-store.vercel.app` |

   Add the Vercel origin to Clerk's allowed origins and redeploy after changing environment variables.

3. Apply database migrations once, from a trusted local machine configured with the same production `DATABASE_URL`:

   ```powershell
   npm.cmd run db:migrate
   ```

4. Deploy the `production` branch. The first administrator sign-in creates the store and membership. Vercel serves `/api/*` from the Express function and the React app for browser routes.

Do not use a personal development database URL for the Vercel production environment. Keep database and Clerk secrets in Vercel's encrypted environment settings, not in Git.

## Workflows

- **Products:** search, filter by category/size/color/stock status, maintain variants, thresholds, and archive products without deleting their movement history.
- **Stock movements:** create incoming, outgoing, or signed adjustment entries. The API locks the variant and rejects any operation that would make stock negative.
- **Purchase orders:** draft, send, then receive orders. Receiving is transactional and creates one incoming movement for every order line.
- **Alerts and reports:** low/out-of-stock products, inventory valuation, period-based movement charts, CSV export, and browser print/PDF.
- **Users and roles:** invite members and assign Admin, Storekeeper, or Viewer access. The API enforces the same role boundaries as the navigation.
- **Languages and theme:** Arabic is the default, with a French switch and light/dark mode.

## Validation

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

The test suite covers movement balance rules and CSV preview validation. Database-backed flows require a configured PostgreSQL database and Clerk application to exercise end-to-end.
