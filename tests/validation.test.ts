import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../server/errors.js'
import { previewProductCsv } from '../server/import.js'
import { applyStockMovement } from '../server/inventory.js'
import {
  inviteInput,
  movementInput,
  orderInput,
  parseInput,
  passwordResetCompleteInput,
  passwordResetRequestInput,
  productInput,
  roleInput,
  supplierInput,
} from '../server/validation.js'

const validProduct = {
  sku: ' ts-101 ',
  name_ar: ' تيشيرت ',
  name_fr: ' T-shirt ',
  category: 'tshirt',
  price_tnd: '39.9',
  low_stock_threshold: '8',
  variants: [{ size: 'M', color_key: ' NOIR ', color_ar: 'أسود', color_fr: 'Noir', color_hex: '#292D32' }],
}

test('product validation normalizes identifiers and variant colors', () => {
  const parsed = productInput.parse(validProduct)
  assert.equal(parsed.sku, 'TS-101')
  assert.equal(parsed.name_fr, 'T-shirt')
  assert.equal(parsed.price_tnd, 39.9)
  assert.equal(parsed.low_stock_threshold, 8)
  assert.equal(parsed.variants[0].color_key, 'noir')
})

test('product validation rejects missing variants, invalid categories, and excessive variants', () => {
  assert.equal(productInput.safeParse({ ...validProduct, variants: [] }).success, false)
  assert.equal(productInput.safeParse({ ...validProduct, category: 'furniture' }).success, false)
  assert.equal(productInput.safeParse({
    ...validProduct,
    variants: Array.from({ length: 121 }, (_, index) => ({
      ...validProduct.variants[0],
      size: ['S', 'M', 'L', 'XL', 'ONE_SIZE'][index % 5],
      color_key: `color-${index}`,
    })),
  }).success, false)
})

test('movement validation requires a direction only for adjustments', () => {
  const variantId = 'c3e3dce6-4427-4721-b829-4565a42bfc1c'
  assert.equal(movementInput.safeParse({ variant_id: variantId, type: 'IN', quantity: '2' }).success, true)
  assert.equal(movementInput.safeParse({ variant_id: variantId, type: 'OUT', quantity: 1, adjustment_sign: -1 }).success, false)
  assert.equal(movementInput.safeParse({ variant_id: variantId, type: 'ADJUSTMENT', quantity: 1 }).success, false)
  assert.equal(movementInput.safeParse({ variant_id: variantId, type: 'ADJUSTMENT', quantity: 1, adjustment_sign: -1 }).success, true)
})

test('stock rejects a downward adjustment that would make inventory negative', () => {
  assert.throws(
    () => applyStockMovement(1, { type: 'ADJUSTMENT', quantity: 2, variant_id: 'variant', adjustment_sign: -1 }),
    (error: unknown) => error instanceof HttpError && error.status === 409 && error.code === 'insufficient_stock',
  )
})

test('supplier validation trims fields and supports an omitted email', () => {
  assert.deepEqual(supplierInput.parse({ name: ' Atelier ', phone: ' +216 70 ' }), {
    name: 'Atelier',
    phone: '+216 70',
    city: '',
    email: '',
    notes: '',
  })
  assert.equal(supplierInput.safeParse({ name: 'Atelier', email: 'not-an-email' }).success, false)
})

test('purchase order validation requires a supplier and positive lines', () => {
  const supplierId = '0b8d28ec-994f-4f96-885f-61a11f67e561'
  const variantId = 'c3e3dce6-4427-4721-b829-4565a42bfc1c'
  assert.deepEqual(orderInput.parse({
    supplier_id: supplierId,
    lines: [{ variant_id: variantId, quantity: '3', unit_cost_tnd: '12.5' }],
  }).lines[0], { variant_id: variantId, quantity: 3, unit_cost_tnd: 12.5 })
  assert.equal(orderInput.safeParse({ supplier_id: supplierId, lines: [] }).success, false)
})

test('invitation and role schemas normalize email and reject admin invitations', () => {
  assert.equal(inviteInput.parse({ email: ' MEMBER@example.com ', role: 'viewer' }).email, 'member@example.com')
  assert.equal(inviteInput.safeParse({ email: 'member@example.com', role: 'admin' }).success, false)
  assert.equal(roleInput.safeParse({ role: 'storekeeper' }).success, true)
  assert.equal(roleInput.safeParse({ role: 'owner' }).success, false)
})

test('password reset schemas validate email, token shape, and password limits', () => {
  assert.equal(passwordResetRequestInput.parse({ email: ' USER@example.com ' }).email, 'user@example.com')
  assert.equal(passwordResetCompleteInput.safeParse({ token: 'a'.repeat(64), password: 'a-strong-password' }).success, true)
  assert.equal(passwordResetCompleteInput.safeParse({ token: 'short', password: 'a-strong-password' }).success, false)
})

test('parseInput exposes a stable validation error for API error handling', () => {
  assert.throws(
    () => parseInput(roleInput, { role: 'owner' }),
    (error: unknown) => error instanceof HttpError && error.status === 400 && error.code === 'validation_error',
  )
})

test('CSV preview reports empty files, missing headers, and malformed quoting', () => {
  assert.match(previewProductCsv('').issues[0].message, /empty/i)
  assert.match(previewProductCsv('sku,name_fr\nA,T-shirt').issues[0].message, /Missing columns/)
  assert.ok(previewProductCsv('sku,name_fr\n"A,T-shirt').issues.length > 0)
})

test('CSV preview enforces byte and record-count limits', () => {
  assert.match(previewProductCsv('x'.repeat(2 * 1024 * 1024 + 1)).issues[0].message, /2 MB/)
  const header = 'sku,name_ar,name_fr,category,price_tnd,low_stock_threshold,size,color_key,color_ar,color_fr,color_hex,opening_quantity'
  const rows = Array.from({ length: 2001 }, (_, index) =>
    `SKU-${index},تيشيرت,T-shirt,tshirt,39.9,8,M,color-${index},أسود,Noir,#292D32,0`,
  )
  assert.match(previewProductCsv([header, ...rows].join('\n')).issues[0].message, /2,000/)
})
