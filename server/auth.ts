import { ExpressAuth, getSession, type ExpressAuthConfig } from '@auth/express'
import Credentials from '@auth/express/providers/credentials'
import bcrypt from 'bcryptjs'
import type { NextFunction, Request, Response } from 'express'
import { createHash, randomBytes } from 'node:crypto'
import type { PoolClient } from 'pg'
import { getPool, inTransaction } from './db.js'
import { HttpError } from './errors.js'
import { acceptInvitationInput, emailInput, passwordInput } from './validation.js'

export type StoreRole = 'admin' | 'storekeeper' | 'viewer'

export interface AuthenticatedUser {
  id: string
  store_id: string
  email: string
  role: StoreRole
  auth_version: number
  store_name: string
  store_city: string
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser
}

declare module '@auth/core/types' {
  interface User {
    authVersion?: number
  }

  interface Session {
    user: {
      id: string
      authVersion: number
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    authVersion?: number
  }
}

const rolePages: Record<StoreRole, string[]> = {
  admin: ['dashboard', 'products', 'movements', 'suppliers', 'alerts', 'reports', 'team'],
  storekeeper: ['dashboard', 'products', 'movements', 'suppliers', 'alerts'],
  viewer: ['dashboard', 'products', 'alerts', 'reports'],
}

export const authConfig: ExpressAuthConfig = {
  secret: process.env.AUTH_SECRET,
  basePath: '/api/auth',
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60 },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsedEmail = emailInput.safeParse(credentials.email)
        const parsedPassword = passwordInput.safeParse(credentials.password)
        if (!parsedEmail.success || !parsedPassword.success) return null

        const result = await getPool().query<{
          id: string
          email: string
          password_hash: string | null
          auth_version: number
        }>(
          `SELECT id, email, password_hash, auth_version
           FROM store_users WHERE lower(email) = $1 AND disabled_at IS NULL LIMIT 1`,
          [parsedEmail.data],
        )
        const user = result.rows[0]
        if (!user?.password_hash) return null
        if (!await bcrypt.compare(parsedPassword.data, user.password_hash)) return null
        return {
          id: user.id,
          email: user.email,
          name: user.email,
          authVersion: user.auth_version,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.authVersion = user.authVersion ?? 0
      return token
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
        session.user.authVersion = token.authVersion ?? 0
      }
      return session
    },
  },
}

export const authHandler = ExpressAuth(authConfig)

export function hashOneTimeToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function appLink(path: string, token: string) {
  const origin = process.env.APP_URL
  if (!origin) throw new HttpError(503, 'APP_URL is not configured.', 'configuration_error')
  const url = new URL(path, origin)
  url.searchParams.set('token', token)
  return url.toString()
}

async function sendEmailLink(email: string, subject: string, url: string, description: string, expiresIn: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false
  const from = process.env.EMAIL_FROM
  if (!from) throw new HttpError(503, 'EMAIL_FROM must be configured to send account emails.', 'configuration_error')

  let response: globalThis.Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from,
        to: [email],
        subject,
        text: `${description}\n\n${url}\n\nThis link expires in ${expiresIn}. If you did not request it, you can ignore this message.`,
      }),
    })
  } catch (error) {
    console.error(JSON.stringify({ event: 'account_email_delivery_failed', message: error instanceof Error ? error.message : 'network_error' }))
    throw new HttpError(503, 'Account email delivery failed. Please try again later.', 'email_delivery_failed')
  }
  if (!response.ok) {
    console.error(JSON.stringify({ event: 'account_email_provider_rejected', status: response.status }))
    throw new HttpError(503, 'Account email delivery failed. Please try again later.', 'email_delivery_failed')
  }
  return true
}

export async function provisionBootstrapAdmin() {
  const rawEmail = process.env.BOOTSTRAP_ADMIN_EMAIL
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
  if (!rawEmail && !password) return
  if (!rawEmail || !password) {
    throw new HttpError(503, 'Set both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD.', 'configuration_error')
  }
  const parsedEmail = emailInput.safeParse(rawEmail)
  if (!parsedEmail.success) {
    throw new HttpError(400, 'BOOTSTRAP_ADMIN_EMAIL must be a valid email address.', 'invalid_bootstrap_email')
  }
  const email = parsedEmail.data
  const validPassword = passwordInput.safeParse(password)
  if (!validPassword.success) {
    throw new HttpError(400, 'Bootstrap password must contain at least 12 characters and at most 72 UTF-8 bytes.', 'invalid_bootstrap_password')
  }
  const passwordHash = await bcrypt.hash(validPassword.data, 12)

  await inTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(80461531)')
    let store = await client.query<{ id: string }>('SELECT id FROM stores ORDER BY created_at LIMIT 1 FOR UPDATE')
    if (!store.rows[0]) {
      store = await client.query(
        'INSERT INTO stores (name, city) VALUES ($1, $2) RETURNING id',
        [process.env.STORE_NAME?.trim() || 'NovaStore', process.env.STORE_CITY?.trim() || 'Tunis'],
      )
    }
    await client.query(
      `INSERT INTO store_users (store_id, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (lower(email)) DO UPDATE SET
         password_hash = COALESCE(store_users.password_hash, EXCLUDED.password_hash),
         role = 'admin'`,
      [store.rows[0].id, email, passwordHash],
    )
  })
}

async function acceptInvitation(client: PoolClient, input: {
  token: string
  email: string
  password: string
}) {
  const result = await client.query<{
    id: string
    store_id: string
    email: string
    role: StoreRole
  }>(
    `SELECT id, store_id, email, role FROM invitations
     WHERE token_hash = $1 AND status = 'pending' AND expires_at > now()
     FOR UPDATE`,
    [hashOneTimeToken(input.token)],
  )
  const invitation = result.rows[0]
  if (!invitation || invitation.email.trim().toLowerCase() !== input.email) {
    throw new HttpError(400, 'This invitation is invalid or expired.', 'invalid_invitation')
  }

  const passwordHash = await bcrypt.hash(input.password, 12)
  const inserted = await client.query(
    `INSERT INTO store_users (store_id, email, password_hash, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [invitation.store_id, invitation.email, passwordHash, invitation.role],
  )
  await client.query(
    `UPDATE invitations SET status = 'accepted', accepted_at = now() WHERE id = $1`,
    [invitation.id],
  )
  return inserted.rows[0]
}

export async function acceptStoreInvitation(value: unknown) {
  const input = acceptInvitationInput.safeParse(value)
  if (!input.success) {
    throw new HttpError(400, 'Enter the invited email and a valid password.', 'validation_error')
  }
  return inTransaction((client) => acceptInvitation(client, input.data))
}

export async function createStoreInvitation(
  email: string,
  role: 'storekeeper' | 'viewer',
  storeId: string,
  inviterUserId: string,
) {
  const member = await getPool().query(
    'SELECT 1 FROM store_users WHERE lower(email) = $1',
    [email],
  )
  if (member.rowCount) throw new HttpError(409, 'This email is already a member of the store.', 'already_a_member')

  const token = randomBytes(32).toString('hex')
  const invitationUrl = appLink('/invite', token)
  const invite = await inTransaction(async (client) => {
    await client.query(
      `UPDATE invitations SET status = 'revoked'
       WHERE store_id = $1 AND lower(email) = $2 AND status = 'pending' AND expires_at <= now()`,
      [storeId, email],
    )
    return client.query<{ id: string }>(
      `INSERT INTO invitations (store_id, email, role, invited_by, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '7 days') RETURNING id`,
      [storeId, email, role, inviterUserId, hashOneTimeToken(token)],
    )
  })
  try {
    const sent = await sendEmailLink(email, 'Your NovaStore team invitation', invitationUrl, 'Accept your invitation to NovaStore.', '7 days')
    return {
      id: invite.rows[0].id,
      email,
      role,
      status: 'pending',
      created_at: new Date().toISOString(),
      invitation_url: invitationUrl,
      email_sent: sent,
    }
  } catch (error) {
    await getPool().query("UPDATE invitations SET status = 'revoked' WHERE id = $1", [invite.rows[0].id])
    throw error
  }
}

export async function createPasswordResetLink(userId: string, storeId: string) {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashOneTimeToken(token)
  const resetUrl = appLink('/reset-password', token)
  const user = await inTransaction(async (client) => {
    const member = await client.query<{ id: string; email: string }>(
      `SELECT id, email FROM store_users
       WHERE id = $1 AND store_id = $2 AND disabled_at IS NULL FOR UPDATE`,
      [userId, storeId],
    )
    if (!member.rows[0]) throw new HttpError(404, 'Team member not found.', 'not_found')
    await client.query(
      `UPDATE password_resets SET used_at = now()
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    )
    await client.query(
      `DELETE FROM password_resets WHERE created_at < now() - interval '90 days'`,
    )
    await client.query(
      `INSERT INTO password_resets (store_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '30 minutes')`,
      [storeId, userId, tokenHash],
    )
    return member.rows[0]
  })
  try {
    const emailSent = await sendEmailLink(user.email, 'Reset your NovaStore password', resetUrl, 'Use this secure link to set a new NovaStore password.', '30 minutes')
    return { reset_url: resetUrl, email_sent: emailSent }
  } catch (error) {
    await getPool().query(
      'UPDATE password_resets SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL',
      [tokenHash],
    )
    throw error
  }
}

export async function requestPasswordReset(email: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return false
  const user = await getPool().query<{ id: string; store_id: string }>(
    'SELECT id, store_id FROM store_users WHERE lower(email) = $1 AND disabled_at IS NULL',
    [email],
  )
  if (user.rows[0]) await createPasswordResetLink(user.rows[0].id, user.rows[0].store_id)
  return true
}

export async function completePasswordReset(token: string, password: string) {
  const parsedPassword = passwordInput.safeParse(password)
  if (!parsedPassword.success) {
    throw new HttpError(400, 'Password must be at least 12 characters and no more than 72 UTF-8 bytes.', 'validation_error')
  }
  const passwordHash = await bcrypt.hash(parsedPassword.data, 12)
  return inTransaction(async (client) => {
    const result = await client.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_resets
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [hashOneTimeToken(token)],
    )
    const reset = result.rows[0]
    if (!reset) throw new HttpError(400, 'This reset link is invalid or expired.', 'invalid_reset_link')
    await client.query(
      `UPDATE store_users SET password_hash = $2, auth_version = auth_version + 1
       WHERE id = $1`,
      [reset.user_id, passwordHash],
    )
    await client.query(
      `UPDATE password_resets SET used_at = now()
       WHERE user_id = $1 AND used_at IS NULL`,
      [reset.user_id],
    )
  })
}

export async function authenticate(request: AuthenticatedRequest, _response: Response, next: NextFunction) {
  try {
    const session = await getSession(request, authConfig)
    if (!session?.user?.id) {
      throw new HttpError(401, 'Sign in to continue.', 'authentication_required')
    }
    const result = await getPool().query<AuthenticatedUser>(
      `SELECT u.id, u.store_id, u.email, u.role, u.auth_version,
              s.name AS store_name, s.city AS store_city
       FROM store_users u JOIN stores s ON s.id = u.store_id
       WHERE u.id = $1 AND u.disabled_at IS NULL`,
      [session.user.id],
    )
    const member = result.rows[0]
    if (!member || member.auth_version !== session.user.authVersion) {
      throw new HttpError(401, 'This session is no longer valid. Sign in again.', 'session_revoked')
    }
    request.user = member
    next()
  } catch (error) {
    next(error)
  }
}

export function requireRole(...roles: StoreRole[]) {
  return (request: AuthenticatedRequest, _response: Response, next: NextFunction) => {
    if (!request.user || !roles.includes(request.user.role)) {
      next(new HttpError(403, 'Your role is not allowed to perform this action.', 'forbidden'))
      return
    }
    next()
  }
}

export function getAllowedPages(role: StoreRole) {
  return rolePages[role]
}
