import { expect, test, type APIRequestContext } from '@playwright/test'
import { readE2eContext } from './context.js'
import { resetStore } from './reset-store.js'

let api: APIRequestContext
let data: Awaited<ReturnType<typeof readE2eContext>>
const baseURL = 'http://127.0.0.1:4179'

test.beforeEach(async ({ playwright }) => {
  data = await readE2eContext()
  await resetStore(data)
  api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
  })
  const csrfResponse = await api.get('/api/auth/csrf')
  expect(csrfResponse.ok()).toBeTruthy()
  const { csrfToken } = await csrfResponse.json() as { csrfToken: string }
  const loginResponse = await api.post('/api/auth/callback/credentials', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
    form: {
      csrfToken,
      email: data.adminEmail,
      password: data.adminPassword,
      callbackUrl: baseURL,
    },
  })
  expect(loginResponse.ok()).toBeTruthy()
  const sessionResponse = await api.get('/api/auth/session')
  expect((await sessionResponse.json() as { user?: { email: string } }).user?.email).toBe(data.adminEmail)
})

test.afterEach(async () => {
  await api?.dispose()
})

test('health and session endpoints return their documented JSON shapes', async () => {
  expect(await (await api.get('/api/health')).json()).toEqual({ status: 'ok' })
  expect((await api.get('/api/auth/providers')).ok()).toBeTruthy()
  expect((await api.get('/api/auth/csrf')).ok()).toBeTruthy()
  const me = await (await api.get('/api/me')).json()
  expect(me.role).toBe('admin')
  expect(me.allowed_pages).toEqual(expect.arrayContaining(['dashboard', 'products', 'team']))
})

test('dashboard, product search and category filters return the test store only', async () => {
  const dashboard = await (await api.get('/api/dashboard')).json()
  expect(dashboard.metrics.product_count).toBe(1)
  expect(dashboard.metrics.unit_count).toBe(12)
  expect(dashboard.category_values).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'tshirt' })]))
  const products = await (await api.get('/api/products?q=E2E-BASE')).json()
  expect(products).toHaveLength(1)
  expect(products[0].variants[0].id).toBe(data.variantId)
  expect(await (await api.get('/api/products?category=jeans')).json()).toEqual([])
  expect(await (await api.get('/api/alerts')).json()).toHaveLength(0)
})

test('product creation, update, validation and archive work through HTTP', async () => {
  const productInput = {
    sku: `E2E-${Date.now()}`,
    name_ar: 'منتج جديد',
    name_fr: 'Nouveau produit',
    category: 'jeans',
    price_tnd: 80,
    low_stock_threshold: 4,
    variants: [{ size: 'L', color_key: 'bleu', color_ar: 'أزرق', color_fr: 'Bleu', color_hex: '#526D91' }],
  }
  const create = await api.post('/api/products', { data: productInput })
  expect(create.status()).toBe(201)
  const product = await create.json()
  expect(product.sku).toBe(productInput.sku)
  const update = await api.put(`/api/products/${product.id}`, { data: { ...productInput, name_fr: 'Produit modifié' } })
  expect(update.status()).toBe(200)
  expect((await update.json()).name_fr).toBe('Produit modifié')
  const invalid = await api.post('/api/products', { data: { ...productInput, variants: [] } })
  expect(invalid.status()).toBe(400)
  expect((await invalid.json()).code).toBe('validation_error')
  const archive = await api.delete(`/api/products/${product.id}`)
  expect(archive.status()).toBe(204)
  expect(await (await api.get(`/api/products?q=${productInput.sku}`)).json()).toEqual([])
})

test('stock movement creation, listing, insufficient stock and validation are enforced', async () => {
  const add = await api.post('/api/movements', {
    data: { variant_id: data.variantId, type: 'IN', quantity: 3, note: 'e2e-add' },
  })
  expect(add.status()).toBe(201)
  const adjustment = await api.post('/api/movements', {
    data: { variant_id: data.variantId, type: 'ADJUSTMENT', quantity: 2, adjustment_sign: -1 },
  })
  expect(adjustment.status()).toBe(201)
  const oversell = await api.post('/api/movements', {
    data: { variant_id: data.variantId, type: 'OUT', quantity: 100 },
  })
  expect(oversell.status()).toBe(409)
  expect((await oversell.json()).code).toBe('insufficient_stock')
  expect(await (await api.get('/api/movements?days=90')).json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ note: 'e2e-add' }),
  ]))
  const invalidDays = await api.get('/api/movements?days=not-a-number')
  expect(invalidDays.ok()).toBeTruthy()
})

test('supplier and purchase-order lifecycle updates stock exactly once', async () => {
  const supplierResponse = await api.post('/api/suppliers', {
    data: { name: `E2E supplier ${Date.now()}`, phone: '', city: 'Tunis', email: '', notes: 'test' },
  })
  expect(supplierResponse.status()).toBe(201)
  const supplier = await supplierResponse.json()
  const updateSupplier = await api.put(`/api/suppliers/${supplier.id}`, {
    data: { name: supplier.name, phone: '+216 71', city: 'Sfax', email: '', notes: 'updated' },
  })
  expect((await updateSupplier.json()).city).toBe('Sfax')
  expect((await api.get('/api/suppliers')).status()).toBe(200)

  const orderResponse = await api.post('/api/purchase-orders', {
    data: {
      supplier_id: data.supplierId,
      lines: [{ variant_id: data.variantId, quantity: 4, unit_cost_tnd: 12.5 }],
    },
  })
  expect(orderResponse.status()).toBe(201)
  const order = await orderResponse.json()
  expect((await api.patch(`/api/purchase-orders/${order.id}/status`, { data: { status: 'received' } })).status()).toBe(409)
  expect((await api.patch(`/api/purchase-orders/${order.id}/status`, { data: { status: 'sent' } })).status()).toBe(200)
  expect((await api.patch(`/api/purchase-orders/${order.id}/status`, { data: { status: 'received' } })).status()).toBe(200)
  expect((await api.patch(`/api/purchase-orders/${order.id}/status`, { data: { status: 'received' } })).status()).toBe(409)
  expect((await api.get('/api/purchase-orders')).status()).toBe(200)
})

test('alerts, inventory reports, and report period query return expected data', async () => {
  const movement = await api.post('/api/movements', {
    data: { variant_id: data.variantId, type: 'OUT', quantity: 10 },
  })
  expect(movement.status()).toBe(201)
  const alerts = await (await api.get('/api/alerts')).json()
  expect(alerts).toEqual(expect.arrayContaining([expect.objectContaining({ id: data.productId, quantity: 2 })]))
  const reportResponse = await api.get('/api/reports/inventory?days=7')
  expect(reportResponse.status()).toBe(200)
  const report = await reportResponse.json()
  expect(report.totals.product_count).toBe(1)
  expect(report.products[0].value_tnd).toBe('51.000')
  expect((await api.get('/api/reports/inventory?days=365')).status()).toBe(200)
})

test('team management creates invitations and password reset links', async ({ playwright }) => {
  const team = await (await api.get('/api/team')).json()
  expect(team.users).toHaveLength(3)
  const inviteEmail = `invite-${Date.now()}@e2e.invalid`
  const invite = await api.post('/api/team/invitations', {
    data: { email: inviteEmail, role: 'viewer' },
  })
  expect(invite.status()).toBe(201)
  const invitation = await invite.json()
  expect(invitation.invitation_url).toContain('/invite?token=')
  expect(invitation.email_sent).toBe(false)
  const invitationToken = new URL(invitation.invitation_url).searchParams.get('token')
  expect(invitationToken).toBeTruthy()
  const accepted = await api.post('/api/public/invitations/accept', {
    data: { token: invitationToken, email: inviteEmail, password: 'a-secure-e2e-password' },
  })
  expect(accepted.status()).toBe(201)
  const repeatedAcceptance = await api.post('/api/public/invitations/accept', {
    data: { token: invitationToken, email: inviteEmail, password: 'a-secure-e2e-password' },
  })
  expect(repeatedAcceptance.status()).toBe(400)

  const reset = await api.post(`/api/team/${data.viewerId}/password-reset`)
  expect(reset.status()).toBe(200)
  const resetLink = (await reset.json()).reset_url as string
  expect(resetLink).toContain('/reset-password?token=')
  expect((await api.patch(`/api/team/${data.adminId}/role`, { data: { role: 'viewer' } })).status()).toBe(409)
  expect((await api.patch(`/api/team/${data.viewerId}/role`, { data: { role: 'storekeeper' } })).status()).toBe(200)
  const resetToken = new URL(resetLink).searchParams.get('token')
  expect(resetToken).toBeTruthy()
  expect((await api.post('/api/public/password-reset/complete', {
    data: { token: resetToken, password: 'a-new-e2e-password' },
  })).status()).toBe(200)
  expect((await api.post('/api/public/password-reset/complete', {
    data: { token: resetToken, password: 'a-new-e2e-password' },
  })).status()).toBe(400)
  const resetUser = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } })
  try {
    const resetCsrf = await (await resetUser.get('/api/auth/csrf')).json() as { csrfToken: string }
    const resetLogin = await resetUser.post('/api/auth/callback/credentials', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
      form: {
        csrfToken: resetCsrf.csrfToken,
        email: data.viewerEmail,
        password: 'a-new-e2e-password',
        callbackUrl: baseURL,
      },
    })
    expect(resetLogin.ok()).toBeTruthy()
    await expect(resetUser.get('/api/auth/session').then((response) => response.json())).resolves.toMatchObject({
      user: { email: data.viewerEmail },
    })
  } finally {
    await resetUser.dispose()
  }
})

test('team member CRUD deactivates access, preserves records, and supports reactivation', async ({ playwright }) => {
  const memberSession = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } })
  const loginAttempt = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } })
  try {
    const csrf = await (await memberSession.get('/api/auth/csrf')).json() as { csrfToken: string }
    const login = await memberSession.post('/api/auth/callback/credentials', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
      form: {
        csrfToken: csrf.csrfToken,
        email: data.storekeeperEmail,
        password: data.storekeeperPassword,
        callbackUrl: baseURL,
      },
    })
    expect(login.ok()).toBeTruthy()
    expect((await memberSession.get('/api/me')).status()).toBe(200)
    const memberMovement = await memberSession.post('/api/movements', {
      data: { variant_id: data.variantId, type: 'IN', quantity: 1, note: 'created-by-deactivated-member' },
    })
    expect(memberMovement.status()).toBe(201)
    expect((await api.delete(`/api/team/${data.adminId}`)).status()).toBe(409)
    expect((await api.delete(`/api/team/${data.storekeeperId}`)).status()).toBe(204)

    const membersAfterDelete = await (await api.get('/api/team')).json()
    expect(membersAfterDelete.users).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: data.storekeeperId, disabled_at: expect.any(String) }),
    ]))
    expect(await (await api.get('/api/movements?days=90')).json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ note: 'created-by-deactivated-member', created_by_email: data.storekeeperEmail }),
    ]))
    expect((await api.post(`/api/team/${data.storekeeperId}/password-reset`)).status()).toBe(404)
    expect((await memberSession.get('/api/me')).status()).toBe(401)

    const disabledLoginCsrf = await (await loginAttempt.get('/api/auth/csrf')).json() as { csrfToken: string }
    await loginAttempt.post('/api/auth/callback/credentials', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
      form: {
        csrfToken: disabledLoginCsrf.csrfToken,
        email: data.storekeeperEmail,
        password: data.storekeeperPassword,
        callbackUrl: baseURL,
      },
    })
    expect(await (await loginAttempt.get('/api/auth/session')).json()).toBeNull()

    const reactivated = await api.patch(`/api/team/${data.storekeeperId}/status`, { data: { is_active: true } })
    expect(reactivated.status()).toBe(200)
    expect((await reactivated.json()).disabled_at).toBeNull()
    const reactivatedLoginCsrf = await (await loginAttempt.get('/api/auth/csrf')).json() as { csrfToken: string }
    const reactivatedLogin = await loginAttempt.post('/api/auth/callback/credentials', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
      form: {
        csrfToken: reactivatedLoginCsrf.csrfToken,
        email: data.storekeeperEmail,
        password: data.storekeeperPassword,
        callbackUrl: baseURL,
      },
    })
    expect(reactivatedLogin.ok()).toBeTruthy()
    expect((await loginAttempt.get('/api/me')).status()).toBe(200)
  } finally {
    await memberSession.dispose()
    await loginAttempt.dispose()
  }
})

test('concurrent administrator demotions cannot remove the final active administrator', async ({ playwright }) => {
  expect((await api.patch(`/api/team/${data.storekeeperId}/role`, { data: { role: 'admin' } })).status()).toBe(200)
  const secondAdmin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } })
  try {
    const csrf = await (await secondAdmin.get('/api/auth/csrf')).json() as { csrfToken: string }
    const login = await secondAdmin.post('/api/auth/callback/credentials', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
      form: {
        csrfToken: csrf.csrfToken,
        email: data.storekeeperEmail,
        password: data.storekeeperPassword,
        callbackUrl: baseURL,
      },
    })
    expect(login.ok()).toBeTruthy()
    const [demoteSecondAdmin, demoteFirstAdmin] = await Promise.all([
      api.patch(`/api/team/${data.storekeeperId}/role`, { data: { role: 'viewer' } }),
      secondAdmin.patch(`/api/team/${data.adminId}/role`, { data: { role: 'viewer' } }),
    ])
    const statuses = [demoteSecondAdmin.status(), demoteFirstAdmin.status()].sort()
    expect(statuses[0]).toBe(200)
    expect([403, 409]).toContain(statuses[1])
    const survivingAdmin = demoteSecondAdmin.status() === 200 ? api : secondAdmin
    const team = await (await survivingAdmin.get('/api/team')).json()
    expect(team.users.filter((user: { role: string; disabled_at: string | null }) =>
      user.role === 'admin' && user.disabled_at === null,
    )).toHaveLength(1)
  } finally {
    await secondAdmin.dispose()
  }
})

test('CSV import preview and commit preserve opening quantities as movements', async () => {
  const csv = [
    'sku,name_ar,name_fr,category,price_tnd,low_stock_threshold,size,color_key,color_ar,color_fr,color_hex,opening_quantity',
    `E2E-CSV-${Date.now()},منتج مستورد,Produit importé,tshirt,15,2,S,vert,أخضر,Vert,#667C62,6`,
  ].join('\n')
  const preview = await api.post('/api/import/preview', { data: { csv } })
  expect(preview.status()).toBe(200)
  expect((await preview.json()).opening_units).toBe(6)
  const badPreview = await api.post('/api/import/preview', { data: { csv: 'bad,csv' } })
  expect(badPreview.status()).toBe(422)
  const commit = await api.post('/api/import/commit', { data: { csv } })
  expect(commit.status()).toBe(201)
  expect((await commit.json()).product_count).toBe(1)
  const imported = await api.get(`/api/products?q=E2E-CSV-${csv.match(/E2E-CSV-(\d+)/)?.[1]}`)
  expect((await imported.json())[0].quantity).toBe(6)
})

test('public password-reset requests are generic and public validation is explicit', async () => {
  const response = await api.post('/api/public/password-reset/request', {
    data: { email: `missing-${Date.now()}@e2e.invalid` },
  })
  expect(response.status()).toBe(202)
  expect((await response.json()).email_enabled).toBe(false)
  const invalid = await api.post('/api/public/invitations/accept', { data: { token: 'bad', email: 'bad', password: 'short' } })
  expect(invalid.status()).toBe(400)
})

test('access control hides viewer-only administration routes and scopes roles', async ({ playwright }) => {
  const viewer = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } })
  try {
    const csrf = await (await viewer.get('/api/auth/csrf')).json() as { csrfToken: string }
    const login = await viewer.post('/api/auth/callback/credentials', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
      form: {
        csrfToken: csrf.csrfToken,
        email: data.viewerEmail,
        password: data.viewerPassword,
        callbackUrl: baseURL,
      },
    })
    expect(login.ok()).toBeTruthy()
    expect((await viewer.get('/api/team')).status()).toBe(403)
    expect((await viewer.post('/api/products', {
      data: {
        sku: 'E2E-FORBIDDEN',
        name_ar: 'منتج',
        name_fr: 'Produit',
        category: 'tshirt',
        price_tnd: 10,
        low_stock_threshold: 0,
        variants: [{ size: 'M', color_key: 'noir', color_ar: 'أسود', color_fr: 'Noir', color_hex: '#000000' }],
      },
    })).status()).toBe(403)
    expect((await viewer.get('/api/reports/inventory')).status()).toBe(200)
    expect((await viewer.post('/api/import/preview', { data: { csv: 'sku' } })).status()).toBe(403)
  } finally {
    await viewer.dispose()
  }
})

test('database API routes reject unauthenticated requests and expose JSON 404 responses', async ({ playwright }) => {
  const anonymous = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } })
  try {
    for (const route of ['/api/me', '/api/dashboard', '/api/products', '/api/alerts', '/api/reports/inventory', '/api/team']) {
      const response = await anonymous.get(route)
      expect(response.status(), route).toBe(401)
      expect(response.headers()['content-type']).toContain('application/json')
    }
    const notFound = await api.get('/api/not-a-route')
    expect(notFound.status()).toBe(404)
    expect((await notFound.json()).code).toBe('not_found')
  } finally {
    await anonymous.dispose()
  }
})
