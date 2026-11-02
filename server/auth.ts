import { createClerkClient, verifyToken } from '@clerk/backend'
import type { NextFunction, Request, Response } from 'express'
import type { PoolClient } from 'pg'
import { getPool, inTransaction } from './db.js'
import { HttpError } from './errors.js'

export type StoreRole = 'admin' | 'storekeeper' | 'viewer'

export interface AuthenticatedUser {
  id: string
  store_id: string
  clerk_user_id: string
  email: string
  role: StoreRole
  store_name: string
  store_city: string
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser
}

const rolePages: Record<StoreRole, string[]> = {
  admin: ['dashboard', 'products', 'movements', 'suppliers', 'alerts', 'reports', 'team'],
  storekeeper: ['dashboard', 'products', 'movements', 'suppliers', 'alerts'],
  viewer: ['dashboard', 'products', 'alerts', 'reports'],
}

let clerkClient: ReturnType<typeof createClerkClient> | undefined

function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) throw new HttpError(503, 'CLERK_SECRET_KEY is not configured.', 'configuration_error')
  clerkClient ??= createClerkClient({ secretKey })
  return clerkClient
}

async function getVerifiedPrimaryEmail(clerkUserId: string) {
  const user = await getClerkClient().users.getUser(clerkUserId)
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)
  if (!primary || primary.verification?.status !== 'verified') {
    throw new HttpError(403, 'A verified primary email address is required.', 'email_not_verified')
  }
  return primary.emailAddress.trim().toLowerCase()
}

async function createBootstrapAdmin(clerkUserId: string, email: string) {
  return inTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(80461531)')
    let store = await client.query<{ id: string; name: string; city: string }>(
      'SELECT id, name, city FROM stores ORDER BY created_at LIMIT 1 FOR UPDATE',
    )
    if (!store.rows[0]) {
      store = await client.query(
        'INSERT INTO stores (name, city) VALUES ($1, $2) RETURNING id, name, city',
        [process.env.STORE_NAME?.trim() || 'NovaStore', process.env.STORE_CITY?.trim() || 'Tunis'],
      )
    }
    await client.query(
      `INSERT INTO store_users (store_id, clerk_user_id, email, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (clerk_user_id) DO UPDATE SET email = EXCLUDED.email`,
      [store.rows[0].id, clerkUserId, email],
    )
    return client.query<AuthenticatedUser>(
      `SELECT u.id, u.store_id, u.clerk_user_id, u.email, u.role, s.name AS store_name, s.city AS store_city
       FROM store_users u JOIN stores s ON s.id = u.store_id WHERE u.clerk_user_id = $1`,
      [clerkUserId],
    ).then((result) => result.rows[0])
  })
}

async function acceptInvitation(client: PoolClient, clerkUserId: string, email: string) {
  const result = await client.query<{ id: string; store_id: string; role: StoreRole }>(
    `SELECT id, store_id, role FROM invitations
     WHERE lower(email) = $1 AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [email],
  )
  const invitation = result.rows[0]
  if (!invitation) return undefined

  const inserted = await client.query(
    `INSERT INTO store_users (store_id, clerk_user_id, email, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (clerk_user_id) DO NOTHING
     RETURNING id`,
    [invitation.store_id, clerkUserId, email, invitation.role],
  )
  if (!inserted.rowCount) {
    throw new HttpError(409, 'This account is already attached to another store.', 'membership_conflict')
  }
  await client.query(
    `UPDATE invitations SET status = 'accepted', accepted_at = now() WHERE id = $1`,
    [invitation.id],
  )
  return invitation.store_id
}

async function resolveMembership(clerkUserId: string): Promise<AuthenticatedUser> {
  const current = await getPool().query<AuthenticatedUser>(
    `SELECT u.id, u.store_id, u.clerk_user_id, u.email, u.role, s.name AS store_name, s.city AS store_city
     FROM store_users u JOIN stores s ON s.id = u.store_id WHERE u.clerk_user_id = $1`,
    [clerkUserId],
  )
  if (current.rows[0]) return current.rows[0]

  const email = await getVerifiedPrimaryEmail(clerkUserId)
  if (process.env.BOOTSTRAP_ADMIN_CLERK_USER_ID === clerkUserId) {
    return createBootstrapAdmin(clerkUserId, email)
  }

  await inTransaction((client) => acceptInvitation(client, clerkUserId, email))
  const accepted = await getPool().query<AuthenticatedUser>(
    `SELECT u.id, u.store_id, u.clerk_user_id, u.email, u.role, s.name AS store_name, s.city AS store_city
     FROM store_users u JOIN stores s ON s.id = u.store_id WHERE u.clerk_user_id = $1`,
    [clerkUserId],
  )
  if (!accepted.rows[0]) {
    throw new HttpError(403, 'This account has not been invited to NovaStore.', 'invitation_required')
  }
  return accepted.rows[0]
}

export async function authenticate(request: AuthenticatedRequest, _response: Response, next: NextFunction) {
  try {
    const authorization = request.header('authorization')
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) throw new HttpError(401, 'Sign in to continue.', 'authentication_required')
    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) throw new HttpError(503, 'CLERK_SECRET_KEY is not configured.', 'configuration_error')
    const authorizedParties = [process.env.APP_URL, 'http://localhost:5173'].filter((value): value is string => Boolean(value))
    const claims = await verifyToken(token, { secretKey, authorizedParties })
    if (typeof claims.sub !== 'string' || !claims.sub) {
      throw new HttpError(401, 'The session token has no user identity.', 'invalid_token')
    }
    request.user = await resolveMembership(claims.sub)
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

export async function createStoreInvitation(
  email: string,
  role: 'storekeeper' | 'viewer',
  storeId: string,
  inviterUserId: string,
) {
  const member = await getPool().query(
    'SELECT 1 FROM store_users WHERE store_id = $1 AND lower(email) = $2',
    [storeId, email],
  )
  if (member.rowCount) throw new HttpError(409, 'This email is already a member of the store.', 'already_a_member')

  const invite = await getPool().query<{ id: string }>(
    `INSERT INTO invitations (store_id, email, role, invited_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [storeId, email, role, inviterUserId],
  )
  try {
    const clerkInvitation = await getClerkClient().invitations.createInvitation({
      emailAddress: email,
      notify: true,
      redirectUrl: process.env.APP_URL,
    })
    await getPool().query('UPDATE invitations SET clerk_invitation_id = $1 WHERE id = $2', [clerkInvitation.id, invite.rows[0].id])
    return { id: invite.rows[0].id, email, role, status: 'pending', created_at: new Date().toISOString() }
  } catch (error) {
    await getPool().query("DELETE FROM invitations WHERE id = $1 AND clerk_invitation_id IS NULL", [invite.rows[0].id])
    throw error
  }
}
