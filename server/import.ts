import { parse } from 'csv-parse/sync'
import { importRowInput, type ImportRow } from './validation.js'

export interface ImportIssue {
  row: number
  message: string
}

export interface ProductImportPreview {
  rows: ImportRow[]
  issues: ImportIssue[]
  product_count: number
  variant_count: number
  opening_units: number
}

export function previewProductCsv(csv: string): ProductImportPreview {
  if (!csv.trim()) {
    return { rows: [], issues: [{ row: 1, message: 'CSV file is empty.' }], product_count: 0, variant_count: 0, opening_units: 0 }
  }
  if (Buffer.byteLength(csv, 'utf8') > 2 * 1024 * 1024) {
    return { rows: [], issues: [{ row: 1, message: 'CSV exceeds the 2 MB limit.' }], product_count: 0, variant_count: 0, opening_units: 0 }
  }

  let records: Record<string, unknown>[]
  try {
    records = parse(csv, { columns: true, skip_empty_lines: true, bom: true, trim: true, relax_column_count: false })
  } catch (error) {
    return {
      rows: [],
      issues: [{ row: 1, message: error instanceof Error ? error.message : 'CSV could not be parsed.' }],
      product_count: 0,
      variant_count: 0,
      opening_units: 0,
    }
  }

  if (records.length === 0) {
    return { rows: [], issues: [{ row: 1, message: 'CSV has a header but no product rows.' }], product_count: 0, variant_count: 0, opening_units: 0 }
  }
  if (records.length > 2000) {
    return { rows: [], issues: [{ row: 1, message: 'CSV may contain at most 2,000 variant rows.' }], product_count: 0, variant_count: 0, opening_units: 0 }
  }

  const rows: ImportRow[] = []
  const issues: ImportIssue[] = []
  const productDetails = new Map<string, string>()
  const variants = new Set<string>()
  const requiredHeaders = Object.keys(importRowInput.shape)
  const headers = Object.keys(records[0])
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header))
  const extraHeaders = headers.filter((header) => !requiredHeaders.includes(header))
  if (missingHeaders.length) issues.push({ row: 1, message: `Missing columns: ${missingHeaders.join(', ')}.` })
  if (extraHeaders.length) issues.push({ row: 1, message: `Unexpected columns: ${extraHeaders.join(', ')}.` })
  if (missingHeaders.length || extraHeaders.length) {
    return { rows, issues, product_count: 0, variant_count: 0, opening_units: 0 }
  }

  records.forEach((record, index) => {
    const rowNumber = index + 2
    const parsed = importRowInput.safeParse(record)
    if (!parsed.success) {
      issues.push({
        row: rowNumber,
        message: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      })
      return
    }
    const row = parsed.data
    const productDetailsKey = JSON.stringify([
      row.name_ar, row.name_fr, row.category, row.price_tnd, row.low_stock_threshold,
    ])
    const previousDetails = productDetails.get(row.sku)
    if (previousDetails && previousDetails !== productDetailsKey) {
      issues.push({ row: rowNumber, message: `Product fields for ${row.sku} differ between variant rows.` })
      return
    }
    productDetails.set(row.sku, productDetailsKey)
    const variantKey = `${row.sku}:${row.size}:${row.color_key.toLowerCase()}`
    if (variants.has(variantKey)) {
      issues.push({ row: rowNumber, message: `Duplicate variant ${row.sku} / ${row.size} / ${row.color_key}.` })
      return
    }
    variants.add(variantKey)
    rows.push(row)
  })

  return {
    rows,
    issues,
    product_count: new Set(rows.map((row) => row.sku)).size,
    variant_count: rows.length,
    opening_units: rows.reduce((total, row) => total + row.opening_quantity, 0),
  }
}
