# NovaStore implementation roadmap

This roadmap extends the existing inventory MVP incrementally. Existing product, variant, supplier, purchase-order, inventory-movement, authentication, and migration behavior must remain compatible.

## Architecture guardrails

- Keep PostgreSQL as the source of truth; inventory is derived only from `inventory_movements`.
- Scope every business record and query by `store_id`; use composite foreign keys for tenant-owned relationships.
- Validate API inputs with Zod and enforce authorization in Express middleware, not only in the UI.
- Commit each business workflow in a database transaction. Never mutate stock outside the inventory movement ledger.
- Keep customer and supplier records usable without login accounts. Add external portals only as a later, separately secured scope.
- Prefer append-only financial and stock records; corrections should use explicit returns, reversals, or adjustments.

## Delivery status

| Phase | Scope | Status |
|---|---|---|
| Foundation | Existing authentication, products, stock, suppliers, and purchase orders | Complete |
| Sprint 1 — Sales | Customers, cashier role, POS sale creation, payment record, invoice number, stock deduction, sales history | Complete |
| Sprint 2 — Finance | Cash sessions and reconciliation, expenses, supplier/customer balances, VAT, finance reports | Planned |
| Sprint 3 — Purchasing | Purchase requests, supplier quotes, approvals, supplier invoices, receiving workflow | Planned |
| Sprint 4 — Returns | Customer returns/refunds, supplier returns/credit notes, complaints | Planned |
| Sprint 5 — Stock operations | Warehouses/locations, transfers, inventory counts, damage/loss reporting | Planned |
| Sprint 6 — Administration | Brands/categories management, store settings, configurable permissions, audit trail, exports | Planned |
| External access | Optional customer and supplier accounts/portals | Planned; internal records remain supported without accounts |

## Sprint 1 — Sales vertical slice

- [x] Add customer and sale persistence, payment method, and sale-linked stock ledger records.
- [x] Add cashier authorization and customer/sales API validation.
- [x] Add tenant-scoped customer and sales endpoints.
- [x] Add the cashier POS and sales-history UI, including printable invoice details.
- [x] Add API and UI workflow tests; verify concurrency and insufficient-stock behavior.
- [x] Update user documentation with migration and workflow details.

**Initial business rules:** a sale is confirmed and fully paid atomically; payment is cash or card; one variant may appear once per sale; prices are snapshotted from the product at sale time; discounts are a non-negative fixed TND amount not exceeding the subtotal; stock cannot become negative. Returns, partial payments, tax configuration, and cash-drawer reconciliation belong to later sprints.

## Sprint 2 — Finance

- [ ] Add cash register sessions and immutable opening/closing records.
- [ ] Add expenses and approval workflow.
- [ ] Add customer/supplier balances and payment allocations.
- [ ] Add configurable tax rules and VAT reports.
- [ ] Add finance dashboard and reports.

## Sprint 3 — Purchasing

- [ ] Add purchase requests and request lines.
- [ ] Add supplier quote requests and quote comparisons.
- [ ] Add explicit approval and rejection states before order submission.
- [ ] Add supplier invoices and payment tracking.
- [ ] Preserve the existing purchase-order receiving transaction and movement ledger.

## Sprint 4 — Returns

- [ ] Add sale returns and return lines with approval and refund records.
- [ ] Restore stock through linked incoming movements only for resalable goods.
- [ ] Add supplier returns and credit notes.
- [ ] Add customer complaints and their status history.

## Sprint 5 — Stock operations

- [ ] Add warehouses and stock locations.
- [ ] Add transfer requests, dispatch, and receipt movements.
- [ ] Add physical inventory counts and approved adjustments.
- [ ] Add damaged/lost product reports with corresponding stock movements.

## Sprint 6 — Administration and reporting

- [ ] Add managed brands and categories while preserving existing product category values.
- [ ] Add store settings for currency, tax, and commercial rules.
- [ ] Add immutable, tenant-scoped audit events for sensitive mutations.
- [ ] Add reports for sales, purchases, stock, and finance with CSV/PDF export.
- [ ] Replace broad built-in role checks with permission-based access where module coverage is complete.

## Completion gates

- A migration is forward-only and tested against both a fresh database and the current schema.
- API tests cover validation, tenant isolation, role boundaries, transactional rollback, and stock invariants.
- UI workflow tests cover the business path in French and the relevant role navigation.
- `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run build` pass before a phase is marked complete.
