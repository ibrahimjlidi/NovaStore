import dotenv from 'dotenv'
import { getPool, inTransaction } from './db.js'
import { HttpError } from './errors.js'

dotenv.config({ path: '.env.local' })
dotenv.config()

const products = [
  { sku: 'DEMO-TS-001', name_ar: 'تيشيرت قطني أساسي', name_fr: 'T-shirt essentiel en coton', category: 'tshirt', price: 39.9, threshold: 10, stock: 24 },
  { sku: 'DEMO-TS-002', name_ar: 'تيشيرت مخطط', name_fr: 'T-shirt à rayures', category: 'tshirt', price: 45.5, threshold: 8, stock: 18 },
  { sku: 'DEMO-TS-003', name_ar: 'تيشيرت بياقة دائرية', name_fr: 'T-shirt col rond', category: 'tshirt', price: 34.9, threshold: 8, stock: 22 },
  { sku: 'DEMO-TS-004', name_ar: 'تيشيرت بأكمام طويلة', name_fr: 'T-shirt manches longues', category: 'tshirt', price: 49.9, threshold: 10, stock: 6 },
  { sku: 'DEMO-JN-001', name_ar: 'جينز قصّة مستقيمة', name_fr: 'Jean coupe droite', category: 'jeans', price: 119.9, threshold: 8, stock: 26 },
  { sku: 'DEMO-JN-002', name_ar: 'جينز أزرق كلاسيكي', name_fr: 'Jean bleu classique', category: 'jeans', price: 129.5, threshold: 8, stock: 20 },
  { sku: 'DEMO-JN-003', name_ar: 'جينز بقصّة ضيقة', name_fr: 'Jean coupe slim', category: 'jeans', price: 124.9, threshold: 8, stock: 17 },
  { sku: 'DEMO-JN-004', name_ar: 'جينز واسع', name_fr: 'Jean coupe large', category: 'jeans', price: 139.9, threshold: 10, stock: 23 },
  { sku: 'DEMO-DR-001', name_ar: 'فستان صيفي مزهر', name_fr: 'Robe d’été fleurie', category: 'dress', price: 149.9, threshold: 10, stock: 8 },
  { sku: 'DEMO-DR-002', name_ar: 'فستان يومي أنيق', name_fr: 'Robe quotidienne élégante', category: 'dress', price: 169.0, threshold: 8, stock: 19 },
  { sku: 'DEMO-DR-003', name_ar: 'فستان سهرة طويل', name_fr: 'Robe de soirée longue', category: 'dress', price: 249.9, threshold: 6, stock: 15 },
  { sku: 'DEMO-DR-004', name_ar: 'فستان كتان', name_fr: 'Robe en lin', category: 'dress', price: 189.5, threshold: 8, stock: 21 },
  { sku: 'DEMO-JK-001', name_ar: 'سترة جينز', name_fr: 'Veste en jean', category: 'jacket', price: 219.9, threshold: 8, stock: 25 },
  { sku: 'DEMO-JK-002', name_ar: 'سترة خفيفة', name_fr: 'Veste légère', category: 'jacket', price: 179.0, threshold: 10, stock: 5 },
  { sku: 'DEMO-JK-003', name_ar: 'سترة مبطنة', name_fr: 'Veste matelassée', category: 'jacket', price: 289.9, threshold: 6, stock: 16 },
  { sku: 'DEMO-JK-004', name_ar: 'سترة كاجوال', name_fr: 'Veste décontractée', category: 'jacket', price: 199.9, threshold: 8, stock: 20 },
  { sku: 'DEMO-SH-001', name_ar: 'حذاء رياضي يومي', name_fr: 'Baskets du quotidien', category: 'shoes', price: 159.9, threshold: 8, stock: 27 },
  { sku: 'DEMO-SH-002', name_ar: 'حذاء قماشي', name_fr: 'Chaussures en toile', category: 'shoes', price: 99.9, threshold: 8, stock: 18 },
  { sku: 'DEMO-SH-003', name_ar: 'حذاء جلدي كلاسيكي', name_fr: 'Chaussures classiques en cuir', category: 'shoes', price: 229.0, threshold: 8, stock: 6 },
  { sku: 'DEMO-SH-004', name_ar: 'حذاء خفيف', name_fr: 'Chaussures légères', category: 'shoes', price: 139.9, threshold: 8, stock: 24 },
  { sku: 'DEMO-AC-001', name_ar: 'حزام جلدي', name_fr: 'Ceinture en cuir', category: 'accessories', price: 49.9, threshold: 10, stock: 30 },
  { sku: 'DEMO-AC-002', name_ar: 'حقيبة كتف قماشية', name_fr: 'Sac bandoulière en toile', category: 'accessories', price: 79.9, threshold: 8, stock: 17 },
  { sku: 'DEMO-AC-003', name_ar: 'وشاح قطني', name_fr: 'Écharpe en coton', category: 'accessories', price: 35.0, threshold: 8, stock: 23 },
  { sku: 'DEMO-AC-004', name_ar: 'محفظة صغيرة', name_fr: 'Petit portefeuille', category: 'accessories', price: 59.9, threshold: 10, stock: 4 },
  { sku: 'DEMO-AC-005', name_ar: 'قبعة قطنية', name_fr: 'Casquette en coton', category: 'accessories', price: 39.0, threshold: 8, stock: 21 },
] as const

const suppliers = [
  { name: 'Atelier Carthage', phone: '+216 70 100 101', city: 'Tunis', email: 'contact@atelier-carthage.example' },
  { name: 'Textile du Sahel', phone: '+216 74 200 202', city: 'Sfax', email: 'ventes@textile-sahel.example' },
  { name: 'Monastir Confection', phone: '+216 73 300 303', city: 'Monastir', email: 'info@monastir-confection.example' },
  { name: 'Sousse Mode', phone: '+216 73 400 404', city: 'Sousse', email: 'contact@sousse-mode.example' },
  { name: 'Ben Arous Distribution', phone: '+216 71 500 505', city: 'Ben Arous', email: 'commandes@ben-arous.example' },
] as const

const colors = [
  { key: 'noir', ar: 'أسود', fr: 'Noir', hex: '#25282B' },
  { key: 'beige', ar: 'بيج', fr: 'Beige', hex: '#C9B89A' },
  { key: 'bleu', ar: 'أزرق', fr: 'Bleu', hex: '#526D91' },
  { key: 'blanc', ar: 'أبيض', fr: 'Blanc', hex: '#F2F1EC' },
  { key: 'vert', ar: 'أخضر', fr: 'Vert', hex: '#667C62' },
] as const
const clothingSizes = ['S', 'M', 'L', 'XL'] as const
const lowStockIndexes = new Set([3, 8, 13, 18, 23])
const twiceStockedIndexes = new Set([0, 1, 2, 4, 5, 6, 9, 10, 11, 12])
const activityIndexes = products.map((_, index) => index).filter((index) => !lowStockIndexes.has(index))

const sampleMovements = [
  { type: 'IN', quantity: 6, note: 'demo-replenishment' },
  { type: 'OUT', quantity: 2, note: 'demo-store-sale' },
  { type: 'IN', quantity: 4, note: 'demo-supplier-delivery' },
  { type: 'ADJUSTMENT', quantity: 1, adjustment_sign: -1, note: 'demo-stock-count' },
  { type: 'OUT', quantity: 1, note: 'demo-online-order' },
] as const

async function seedDemoData() {
  const storeEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  await inTransaction(async (client) => {
    const admin = await client.query<{ id: string; store_id: string }>(
      `SELECT id, store_id FROM store_users
       WHERE role = 'admin' AND ($1::text IS NULL OR lower(email) = $1)
       ORDER BY created_at LIMIT 1`,
      [storeEmail || null],
    )
    const user = admin.rows[0]
    if (!user) throw new HttpError(400, 'No administrator exists. Configure the bootstrap admin and run npm.cmd run db:migrate first.', 'admin_not_found')

    await client.query('SELECT pg_advisory_xact_lock(80461532)')
    const existing = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM products WHERE store_id = $1',
      [user.store_id],
    )
    if (Number(existing.rows[0].count) > 0) {
      console.log('Demo seed skipped: this store already has products; no existing data was changed.')
      return
    }

    const supplierIds: string[] = []
    for (const supplier of suppliers) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO suppliers (store_id, name, phone, city, email, notes)
         VALUES ($1, $2, $3, $4, $5, 'Données fictives de démonstration')
         RETURNING id`,
        [user.store_id, supplier.name, supplier.phone, supplier.city, supplier.email],
      )
      supplierIds.push(result.rows[0].id)
    }

    const productVariants: Array<{ id: string; productIndex: number; openingQuantity: number }> = []
    for (const [productIndex, product] of products.entries()) {
      const insertedProduct = await client.query<{ id: string }>(
        `INSERT INTO products
           (store_id, sku, name_ar, name_fr, category, price_tnd, low_stock_threshold)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [user.store_id, product.sku, product.name_ar, product.name_fr, product.category, product.price, product.threshold],
      )

      const isAccessory = product.category === 'accessories'
      const sizes = isAccessory ? ['ONE_SIZE'] : clothingSizes
      const colorIndexes = [productIndex % colors.length, (productIndex + 2) % colors.length]
      const productVariantIds: string[] = []
      for (const colorIndex of colorIndexes) {
        const color = colors[colorIndex]
        for (const size of sizes) {
          const insertedVariant = await client.query<{ id: string }>(
            `INSERT INTO product_variants
               (store_id, product_id, size, color_key, color_ar, color_fr, color_hex)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [user.store_id, insertedProduct.rows[0].id, size, color.key, color.ar, color.fr, color.hex],
          )
          productVariantIds.push(insertedVariant.rows[0].id)
        }
      }

      const baseQuantity = product.stock
      const primaryQuantity = twiceStockedIndexes.has(productIndex)
        ? Math.ceil(baseQuantity * 0.65)
        : baseQuantity
      productVariants.push({ id: productVariantIds[0], productIndex, openingQuantity: primaryQuantity })
      if (twiceStockedIndexes.has(productIndex)) {
        productVariants.push({
          id: productVariantIds[Math.max(1, sizes.length)],
          productIndex,
          openingQuantity: baseQuantity - primaryQuantity,
        })
      }
    }

    const movementPlan: Array<{
      variantId: string
      type: 'IN' | 'OUT' | 'ADJUSTMENT'
      quantity: number
      adjustmentSign?: -1 | 1
      note: string
    }> = productVariants.map((variant) => ({
      variantId: variant.id,
      type: 'IN',
      quantity: variant.openingQuantity,
      note: 'demo-opening-stock',
    }))

    const variantBalances = new Map<string, number>(
      productVariants.map((variant) => [variant.id, variant.openingQuantity]),
    )
    for (let index = 0; index < 25; index += 1) {
      const productIndex = activityIndexes[(index * 7) % activityIndexes.length]
      const productVariantsForActivity = productVariants.filter((variant) => variant.productIndex === productIndex)
      const variant = productVariantsForActivity[index % productVariantsForActivity.length]
      const template = sampleMovements[index % sampleMovements.length]
      const quantity = template.quantity
      const adjustmentSign = template.type === 'ADJUSTMENT' ? template.adjustment_sign : undefined
      const signedQuantity = template.type === 'IN'
        ? quantity
        : template.type === 'OUT'
          ? -quantity
          : quantity * (adjustmentSign ?? 1)
      const balance = variantBalances.get(variant.id) ?? 0
      if (balance + signedQuantity < 0) {
        throw new HttpError(500, 'Demo movements would make stock negative; seed was rolled back.', 'invalid_demo_seed')
      }
      variantBalances.set(variant.id, balance + signedQuantity)
      movementPlan.push({
        variantId: variant.id,
        type: template.type,
        quantity,
        ...(adjustmentSign === undefined ? {} : { adjustmentSign }),
        note: template.note,
      })
    }

    if (movementPlan.length !== 60) {
      throw new HttpError(500, `Demo seed expected 60 movements but prepared ${movementPlan.length}.`, 'invalid_demo_seed')
    }

    const now = Date.now()
    for (const [index, movement] of movementPlan.entries()) {
      const createdAt = new Date(now - (movementPlan.length - index - 1) * 12 * 60 * 60 * 1000)
      await client.query(
        `INSERT INTO inventory_movements
           (store_id, variant_id, type, quantity, adjustment_sign, note, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.store_id,
          movement.variantId,
          movement.type,
          movement.quantity,
          movement.adjustmentSign ?? null,
          movement.note,
          user.id,
          createdAt,
        ],
      )
    }

    for (let index = 0; index < supplierIds.length; index += 1) {
      await client.query(
        `INSERT INTO purchase_orders (store_id, supplier_id, status, created_by, sent_at)
         VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'sent' THEN now() - interval '1 day' END)`,
        [user.store_id, supplierIds[index], index < 2 ? 'draft' : 'sent', user.id],
      )
    }

    console.log(`Seeded ${products.length} demo products, ${productVariants.length} stocked variants, ${movementPlan.length} movements, ${supplierIds.length} suppliers, and ${supplierIds.length} draft/sent purchase orders.`)
  })
}

try {
  await seedDemoData()
} finally {
  await getPool().end()
}
