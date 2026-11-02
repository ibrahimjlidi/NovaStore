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

## Deploy to GitHub Pages

Build the static site with `npm.cmd run build` and publish the generated `dist` directory using your preferred static hosting provider. If the site is hosted below a repository subpath, set Vite's `base` option to that path before building.

All demo data is stored in browser memory and resets when the page is reloaded. No backend is required.
