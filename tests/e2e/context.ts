import { readFile } from 'node:fs/promises'

export interface E2eContext {
  storeId: string
  adminId: string
  adminEmail: string
  adminPassword: string
  storekeeperId: string
  storekeeperEmail: string
  storekeeperPassword: string
  viewerId: string
  viewerEmail: string
  viewerPassword: string
  productId: string
  variantId: string
  supplierId: string
}

export async function readE2eContext() {
  const contents = await readFile('.playwright/e2e-context.json', 'utf8')
  return JSON.parse(contents) as E2eContext
}
