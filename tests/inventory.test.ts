import assert from 'node:assert/strict'
import test from 'node:test'
import { applyStockMovement, signedMovementQuantity } from '../server/inventory.js'
import { previewProductCsv } from '../server/import.js'
import { productInput } from '../server/validation.js'

const header = 'sku,name_ar,name_fr,category,price_tnd,low_stock_threshold,size,color_key,color_ar,color_fr,color_hex,opening_quantity'

test('stock balances are derived from incoming, outgoing, and signed adjustments', () => {
  assert.equal(applyStockMovement(0, { type: 'IN', quantity: 12, variant_id: 'v' }), 12)
  assert.equal(applyStockMovement(12, { type: 'OUT', quantity: 5, variant_id: 'v' }), 7)
  assert.equal(applyStockMovement(7, { type: 'ADJUSTMENT', quantity: 2, variant_id: 'v', adjustment_sign: -1 }), 5)
  assert.equal(signedMovementQuantity({ type: 'ADJUSTMENT', quantity: 3, variant_id: 'v', adjustment_sign: 1 }), 3)
})

test('stock cannot be reduced below zero', () => {
  assert.throws(
    () => applyStockMovement(2, { type: 'OUT', quantity: 3, variant_id: 'v' }),
    (error: unknown) => error instanceof Error && error.message.includes('exceeds the available stock'),
  )
})

test('CSV preview groups product rows and counts opening stock without writing data', () => {
  const csv = [
    header,
    'TS-001,تيشيرت,T-shirt,tshirt,39.900,10,M,noir,أسود,Noir,#282B33,5',
    'TS-001,تيشيرت,T-shirt,tshirt,39.900,10,L,noir,أسود,Noir,#282B33,3',
  ].join('\n')
  const preview = previewProductCsv(csv)
  assert.deepEqual(preview.issues, [])
  assert.equal(preview.product_count, 1)
  assert.equal(preview.variant_count, 2)
  assert.equal(preview.opening_units, 8)
})

test('CSV preview rejects duplicate variants and conflicting product details', () => {
  const csv = [
    header,
    'TS-001,تيشيرت,T-shirt,tshirt,39.900,10,M,noir,أسود,Noir,#282B33,5',
    'TS-001,قميص,Shirt,tshirt,40.000,10,M,noir,أسود,Noir,#282B33,2',
  ].join('\n')
  const preview = previewProductCsv(csv)
  assert.ok(preview.issues.some((issue) => issue.message.includes('differ between variant rows')))
})

test('product validation rejects duplicate size/color combinations before database writes', () => {
  const result = productInput.safeParse({
    sku: 'TS-001',
    name_ar: 'تيشيرت',
    name_fr: 'T-shirt',
    category: 'tshirt',
    price_tnd: 39.9,
    low_stock_threshold: 10,
    variants: [
      { size: 'M', color_key: 'noir', color_ar: 'أسود', color_fr: 'Noir', color_hex: '#282B33' },
      { size: 'M', color_key: 'NOIR', color_ar: 'أسود', color_fr: 'Noir', color_hex: '#282B33' },
    ],
  })
  assert.equal(result.success, false)
})
