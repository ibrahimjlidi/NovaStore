import { z } from 'zod'
import { HttpError } from './errors.js'

const category = z.enum(['tshirt', 'jeans', 'dress', 'jacket', 'shoes', 'accessories'])
const size = z.enum(['S', 'M', 'L', 'XL', 'ONE_SIZE'])

export const variantInput = z.object({
  size,
  color_key: z.string().trim().min(1).max(40).transform((value) => value.toLowerCase()),
  color_ar: z.string().trim().min(1).max(80),
  color_fr: z.string().trim().min(1).max(80),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
})

export const productInput = z.object({
  sku: z.string().trim().min(1).max(64).transform((value) => value.toUpperCase()),
  name_ar: z.string().trim().min(1).max(180),
  name_fr: z.string().trim().min(1).max(180),
  category,
  price_tnd: z.coerce.number().finite().positive().max(999_999_999),
  low_stock_threshold: z.coerce.number().int().min(0).max(1_000_000),
  variants: z.array(variantInput).min(1).max(120),
}).superRefine((product, context) => {
  const keys = new Set<string>()
  product.variants.forEach((variant, index) => {
    const key = `${variant.size}:${variant.color_key.toLowerCase()}`
    if (keys.has(key)) {
      context.addIssue({ code: 'custom', path: ['variants', index], message: 'A size and color combination may only appear once.' })
    }
    keys.add(key)
  })
})

export const movementInput = z.object({
  variant_id: z.string().uuid(),
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
  quantity: z.coerce.number().int().positive().max(1_000_000),
  adjustment_sign: z.union([z.literal(-1), z.literal(1)]).optional(),
  note: z.string().trim().max(500).default(''),
}).superRefine((value, context) => {
  if (value.type === 'ADJUSTMENT' && value.adjustment_sign === undefined) {
    context.addIssue({ code: 'custom', path: ['adjustment_sign'], message: 'Choose whether this adjustment increases or decreases stock.' })
  }
  if (value.type !== 'ADJUSTMENT' && value.adjustment_sign !== undefined) {
    context.addIssue({ code: 'custom', path: ['adjustment_sign'], message: 'Adjustment direction only applies to adjustments.' })
  }
})

export const supplierInput = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).default(''),
  city: z.string().trim().max(100).default(''),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).default(''),
  notes: z.string().trim().max(1000).default(''),
})

export const orderInput = z.object({
  supplier_id: z.string().uuid(),
  lines: z.array(z.object({
    variant_id: z.string().uuid(),
    quantity: z.coerce.number().int().positive().max(1_000_000),
    unit_cost_tnd: z.coerce.number().finite().positive().max(999_999_999),
  })).min(1).max(200),
})

export const inviteInput = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  role: z.enum(['storekeeper', 'viewer']),
})

export const roleInput = z.object({
  role: z.enum(['admin', 'storekeeper', 'viewer']),
})

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const message = result.error.issues.map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; ')
    throw new HttpError(400, message, 'validation_error')
  }
  return result.data
}

export const importRowInput = z.object({
  sku: z.string().trim().min(1).max(64).transform((value) => value.toUpperCase()),
  name_ar: z.string().trim().min(1).max(180),
  name_fr: z.string().trim().min(1).max(180),
  category,
  price_tnd: z.coerce.number().finite().positive().max(999_999_999),
  low_stock_threshold: z.coerce.number().int().min(0).max(1_000_000),
  size,
  color_key: z.string().trim().min(1).max(40).transform((value) => value.toLowerCase()),
  color_ar: z.string().trim().min(1).max(80),
  color_fr: z.string().trim().min(1).max(80),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  opening_quantity: z.coerce.number().int().min(0).max(1_000_000),
})

export type ProductInput = z.infer<typeof productInput>
export type MovementInput = z.infer<typeof movementInput>
export type SupplierInput = z.infer<typeof supplierInput>
export type OrderInput = z.infer<typeof orderInput>
export type InviteInput = z.infer<typeof inviteInput>
export type ImportRow = z.infer<typeof importRowInput>
