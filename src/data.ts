export type Language = 'ar' | 'fr'
export type Size = 'S' | 'M' | 'L' | 'XL'
export type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT'
export type CategoryKey = 'tshirt' | 'jeans' | 'dress' | 'jacket' | 'shoes' | 'accessories'

export interface Variant {
  id: string
  size: Size
  color: string
}

export interface Product {
  id: string
  sku: string
  name: Record<Language, string>
  category: CategoryKey
  price: number
  threshold: number
  variants: Variant[]
  image: string
  accent: string
}

export interface Movement {
  id: string
  productId: string
  variantId: string
  type: MovementType
  quantity: number
  adjustmentSign?: 1 | -1
  date: string
  user: string
  note: string
}

export interface Supplier {
  id: string
  name: string
  phone: string
  city: string
  initials: string
  color: string
}

export const sizes: Size[] = ['S', 'M', 'L', 'XL']

export const colors = [
  { id: 'noir', hex: '#282b33', label: { ar: 'أسود', fr: 'Noir' } },
  { id: 'beige', hex: '#d8c6a9', label: { ar: 'بيج', fr: 'Beige' } },
  { id: 'bleu', hex: '#617b9f', label: { ar: 'أزرق', fr: 'Bleu' } },
]

export const categoryLabels: Record<CategoryKey, Record<Language, string>> = {
  tshirt: { ar: 'تيشيرتات', fr: 'T-shirts' },
  jeans: { ar: 'جينز', fr: 'Jeans' },
  dress: { ar: 'فساتين', fr: 'Robes' },
  jacket: { ar: 'سترات', fr: 'Vestes' },
  shoes: { ar: 'أحذية', fr: 'Chaussures' },
  accessories: { ar: 'إكسسوارات', fr: 'Accessoires' },
}

export function createProductIllustration(category: CategoryKey, accent: string, index = 0) {
  const fabrics = ['#566d5e', '#b77f70', '#607897', '#82728b', '#a88a5b', '#526d75']
  const fabric = fabrics[index % fabrics.length]
  const shapes: Record<CategoryKey, string> = {
    tshirt: '<path d="M43 30 29 36 17 50l12 11 8-8v39h46V53l8 8 12-11-12-14-14-6c-3 8-8 12-17 12s-14-4-17-12Z"/><path d="M43 30c2 8 7 12 17 12s15-4 17-12" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>',
    jeans: '<path d="M38 27h44l5 23-5 43H61l-2-29-3 29H37l-6-43Z"/><path d="M38 28h44M60 31v15m-20-2h10m20 0h9m-19 2 1 43" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>',
    dress: '<path d="M48 27h24l5 15 13 12-8 12-8-6 7 31H39l7-31-8 6-8-12 13-12Z"/><path d="M48 28c1 7 5 10 12 10s11-3 12-10M43 66h34" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>',
    jacket: '<path d="m43 28-14 8-11 15 12 11 8-8v39h44V54l8 8 12-11-11-15-14-8-7 12H50Z"/><path d="m50 40 9 10 9-10m-9 10v42m-17-31h9m16 0h9" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>',
    shoes: '<path d="M24 68c11 0 18-11 22-25l11 2c4 13 9 20 24 24l16 5c7 2 10 7 9 13H24c-7 0-11-3-11-9 0-5 4-10 11-10Z"/><path d="M56 48 52 60m12-8-4 10m12-6-4 8M18 78h92" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2"/>',
    accessories: '<path d="M35 46h50l7 45H28Z"/><path d="M43 47c0-12 6-20 17-20s17 8 17 20M29 59h60" fill="none" stroke="#fff" stroke-opacity=".62" stroke-width="3"/><path d="M47 64h26v14H47z" fill="#fff" fill-opacity=".12"/>',
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="14" fill="${accent}"/><circle cx="95" cy="22" r="18" fill="#fff" fill-opacity=".2"/><ellipse cx="60" cy="99" rx="34" ry="5" fill="#293b31" fill-opacity=".1"/><g fill="${fabric}" stroke="#34483c" stroke-opacity=".12" stroke-width="1.5" stroke-linejoin="round">${shapes[category]}</g></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const productDefinitions: Array<{
  sku: string
  name: Record<Language, string>
  category: CategoryKey
  price: number
  image: string
  accent: string
}> = [
  { sku: 'TS-001', name: { ar: 'تيشيرت قطني أساسي', fr: 'T-shirt coton essentiel' }, category: 'tshirt', price: 39.9, image: 'photo-1521572163474-6864f9cf17ab', accent: '#e9e4dc' },
  { sku: 'TS-002', name: { ar: 'تيشيرت مخطط كلاسيكي', fr: 'T-shirt rayé classique' }, category: 'tshirt', price: 45.5, image: 'photo-1503342217505-b0a15ec3261c', accent: '#e9d7d2' },
  { sku: 'TS-003', name: { ar: 'تيشيرت بياقة دائرية', fr: 'T-shirt col rond' }, category: 'tshirt', price: 34.9, image: 'photo-1583743814966-8936f37f4678', accent: '#d9e3dd' },
  { sku: 'TS-004', name: { ar: 'تيشيرت بطباعة فنية', fr: 'T-shirt imprimé artistique' }, category: 'tshirt', price: 49, image: 'photo-1576566588028-4147f3842f27', accent: '#e5dded' },
  { sku: 'JN-001', name: { ar: 'جينز مستقيم أزرق', fr: 'Jean droit bleu' }, category: 'jeans', price: 119.9, image: 'photo-1542272604-787c3835535d', accent: '#dce4ef' },
  { sku: 'JN-002', name: { ar: 'جينز قصّة واسعة', fr: 'Jean coupe large' }, category: 'jeans', price: 139, image: 'photo-1541099649105-f69ad21f3246', accent: '#d9e0ea' },
  { sku: 'JN-003', name: { ar: 'جينز دنيم داكن', fr: 'Jean denim foncé' }, category: 'jeans', price: 129.5, image: 'photo-1548883354-7622d03aca27', accent: '#d8dfe8' },
  { sku: 'JN-004', name: { ar: 'جينز بخصر عالٍ', fr: 'Jean taille haute' }, category: 'jeans', price: 149, image: 'photo-1582552938357-32b906df40cb', accent: '#e3e1d7' },
  { sku: 'DR-001', name: { ar: 'فستان صيفي مزهر', fr: 'Robe d’été fleurie' }, category: 'dress', price: 159.9, image: 'photo-1595777457583-95e059d581b8', accent: '#f0d9d4' },
  { sku: 'DR-002', name: { ar: 'فستان كتان أنيق', fr: 'Robe en lin élégante' }, category: 'dress', price: 189, image: 'photo-1612336307429-8a898d10e223', accent: '#e6ded0' },
  { sku: 'DR-003', name: { ar: 'فستان ميدي كلاسيكي', fr: 'Robe midi classique' }, category: 'dress', price: 174.5, image: 'photo-1566174053879-31528523f8ae', accent: '#e8dce2' },
  { sku: 'DR-004', name: { ar: 'فستان سهرة ناعم', fr: 'Robe de soirée raffinée' }, category: 'dress', price: 229, image: 'photo-1566174053879-31528523f8ae', accent: '#ddd6e8' },
  { sku: 'JK-001', name: { ar: 'جاكيت دنيم كلاسيكي', fr: 'Veste en jean classique' }, category: 'jacket', price: 199, image: 'photo-1548126032-079a0fb0099d', accent: '#d6e0e9' },
  { sku: 'JK-002', name: { ar: 'جاكيت خفيف مبطن', fr: 'Veste légère matelassée' }, category: 'jacket', price: 249.9, image: 'photo-1591047139829-d91aecb6caea', accent: '#e1ddd5' },
  { sku: 'JK-003', name: { ar: 'بليزر بقصّة عصرية', fr: 'Blazer coupe moderne' }, category: 'jacket', price: 279, image: 'photo-1591369822096-ffd140ec948f', accent: '#dfdbe5' },
  { sku: 'JK-004', name: { ar: 'معطف خفيف يومي', fr: 'Manteau léger quotidien' }, category: 'jacket', price: 319, image: 'photo-1544923246-77307dd654cb', accent: '#e4dfd1' },
  { sku: 'SH-001', name: { ar: 'حذاء رياضي يومي', fr: 'Sneakers de tous les jours' }, category: 'shoes', price: 189, image: 'photo-1542291026-7eec264c27ff', accent: '#e8d7d3' },
  { sku: 'SH-002', name: { ar: 'حذاء رياضي أبيض', fr: 'Sneakers blanches' }, category: 'shoes', price: 219, image: 'photo-1549298916-b41d501d3772', accent: '#e2e2df' },
  { sku: 'SH-003', name: { ar: 'حذاء مشي خفيف', fr: 'Chaussures de marche légères' }, category: 'shoes', price: 169.9, image: 'photo-1460353581641-37baddab0fa2', accent: '#d7e2e3' },
  { sku: 'SH-004', name: { ar: 'حذاء قماشي مريح', fr: 'Chaussures en toile confort' }, category: 'shoes', price: 99, image: 'photo-1525966222134-fcfa99b8ae77', accent: '#e7e0d3' },
  { sku: 'AC-001', name: { ar: 'حقيبة كتف يومية', fr: 'Sac bandoulière quotidien' }, category: 'accessories', price: 89.9, image: 'photo-1553062407-98eeb64c6a62', accent: '#e8d9cb' },
  { sku: 'AC-002', name: { ar: 'قبعة قطنية كلاسيكية', fr: 'Casquette en coton classique' }, category: 'accessories', price: 49.9, image: 'photo-1588850561407-ed78c282e89b', accent: '#e7e2d9' },
  { sku: 'AC-003', name: { ar: 'حزام جلد طبيعي', fr: 'Ceinture en cuir naturel' }, category: 'accessories', price: 59, image: 'photo-1624222247344-550fb8b2f6cc', accent: '#e5d7cb' },
  { sku: 'AC-004', name: { ar: 'وشاح ناعم متعدد الألوان', fr: 'Écharpe douce multicolore' }, category: 'accessories', price: 39, image: 'photo-1601924994987-69e26d50dc26', accent: '#e3dce9' },
  { sku: 'AC-005', name: { ar: 'حقيبة ظهر عملية', fr: 'Sac à dos pratique' }, category: 'accessories', price: 129, image: 'photo-1553062407-98eeb64c6a62', accent: '#dce4dd' },
]

export const products: Product[] = productDefinitions.map((definition, productIndex) => ({
  ...definition,
  id: `p${String(productIndex + 1).padStart(2, '0')}`,
  threshold: productIndex === 23 ? 44 : productIndex === 24 ? 18 : 72,
  variants: sizes.flatMap((size) =>
    colors.slice(0, 2).map((color) => ({
      id: `${definition.sku}-${size}-${color.id}`,
      size,
      color: color.id,
    })),
  ),
  image: createProductIllustration(definition.category, definition.accent, productIndex),
}))

export const suppliers: Supplier[] = [
  { id: 's1', name: 'Atelier Carthage', phone: '+216 71 284 630', city: 'Tunis', initials: 'AC', color: '#e9e5dc' },
  { id: 's2', name: 'Denim House', phone: '+216 74 226 184', city: 'Sfax', initials: 'DH', color: '#dce4ee' },
  { id: 's3', name: 'Mode du Sahel', phone: '+216 73 441 092', city: 'Monastir', initials: 'MS', color: '#e6dfe8' },
  { id: 's4', name: 'Coton & Lin', phone: '+216 73 218 550', city: 'Sousse', initials: 'CL', color: '#e6e9de' },
  { id: 's5', name: 'Soleil Textile', phone: '+216 71 389 720', city: 'Ben Arous', initials: 'ST', color: '#f0dfd5' },
]

const seedNotes = ['delivery', 'restock', 'sale', 'transfer', 'count'] as const

function randomGenerator(seed: number) {
  let value = seed
  return () => {
    value = (value * 9301 + 49297) % 233280
    return value / 233280
  }
}

function isoDaysAgo(days: number, hour: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

export function createSeedMovements(): Movement[] {
  const random = randomGenerator(9417)
  const movements: Movement[] = []
  const stock = new Map<string, number>()

  products.forEach((product, productIndex) => {
    if (productIndex === 24) return
    product.variants.forEach((variant, variantIndex) => {
      const base = productIndex === 23
        ? 2 + ((variantIndex + productIndex) % 3)
        : 6 + ((productIndex * 7 + variantIndex * 3) % 8)
      stock.set(variant.id, base)
      movements.push({
        id: `opening-${variant.id}`,
        productId: product.id,
        variantId: variant.id,
        type: 'IN',
        quantity: base,
        date: isoDaysAgo(38 + (variantIndex % 4), 9 + (variantIndex % 7)),
        user: 'Amine Gharbi',
        note: 'opening',
      })
    })
  })

  for (let index = 0; index < 60; index += 1) {
    const product = products[Math.floor(random() * 24)]
    const variant = product.variants[Math.floor(random() * product.variants.length)]
    const current = stock.get(variant.id) ?? 0
    const seedType = index % 5
    let type: MovementType = seedType === 0 || seedType === 3 ? 'IN' : seedType === 4 ? 'ADJUSTMENT' : 'OUT'
    let quantity = 1 + Math.floor(random() * 4)
    if (type !== 'IN' && current < quantity) type = 'IN'
    const signedQuantity = type === 'IN' ? quantity : type === 'ADJUSTMENT' && index % 2 === 0 ? quantity : -quantity
    if (signedQuantity < 0 && current < Math.abs(signedQuantity)) {
      type = 'IN'
    }
    const delta = type === 'IN' ? quantity : type === 'ADJUSTMENT' && index % 2 === 0 ? quantity : -quantity
    if (delta < 0 && current < Math.abs(delta)) quantity = Math.max(1, current)
    const finalDelta = type === 'IN' ? quantity : type === 'ADJUSTMENT' && index % 2 === 0 ? quantity : -quantity
    stock.set(variant.id, current + finalDelta)
    movements.push({
      id: `seed-${String(index + 1).padStart(2, '0')}`,
      productId: product.id,
      variantId: variant.id,
      type,
      quantity,
      adjustmentSign: type === 'ADJUSTMENT' ? (index % 2 === 0 ? 1 : -1) : undefined,
      date: isoDaysAgo(Math.floor(random() * 30), 8 + Math.floor(random() * 10)),
      user: ['Sami Ben Amor', 'Ines Trabelsi', 'Amine Gharbi'][index % 3],
      note: seedNotes[index % seedNotes.length],
    })
  }

  return movements.sort((a, b) => b.date.localeCompare(a.date))
}

export const initialMovements = createSeedMovements()
