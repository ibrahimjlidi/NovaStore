# NovaStore

A responsive inventory-management demo for a Tunisian clothing store. The interface supports Arabic (RTL) and French, with a light/dark theme and in-memory sample data.

## Features

- Dashboard with stock valuation, movement charts, and low-stock alerts
- Product catalog with size/color variants, filters, and per-product thresholds
- Stock movement history; quantities are derived from movements
- Tunisian suppliers and purchase orders that add incoming stock when received
- Inventory reports, CSV export, browser print/PDF, and role access overview

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

PowerShell may block the `npm.ps1` shim when script execution is disabled. Use `npm.cmd` as shown above; this does not change your execution policy.

## Validate and build

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run preview
```

## Deploy to Vercel

1. Sign in to [Vercel](https://vercel.com/) and choose **Add New → Project**.
2. Connect your GitHub account if prompted, then import `ibrahimjlidi/NovaStore`.
3. Keep the project root as `./` and framework preset as **Vite**.
4. Use `npm run build` for the build command and `dist` for the output directory.
5. Select **Deploy**. Vercel will build the project and provide a public URL.

The repository includes `vercel.json` with an SPA fallback for client-side routes. Future pushes to `main` will trigger Vercel deployments after the Git integration is connected.

All demo data is stored in browser memory and resets when the page is reloaded. No backend is required.
