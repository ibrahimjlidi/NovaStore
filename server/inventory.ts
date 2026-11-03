import { HttpError } from './errors.js'
import type { MovementInput } from './validation.js'

export function signedMovementQuantity(movement: MovementInput) {
  if (movement.type === 'IN') return movement.quantity
  if (movement.type === 'OUT') return -movement.quantity
  return movement.quantity * movement.adjustment_sign!
}

export function applyStockMovement(balance: number, movement: MovementInput) {
  const updated = balance + signedMovementQuantity(movement)
  if (updated < 0) {
    throw new HttpError(409, 'The requested quantity exceeds the available stock.', 'insufficient_stock')
  }
  return updated
}
