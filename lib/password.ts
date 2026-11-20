import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'

export const MIN_PASSWORD_LENGTH = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// Temp passwords are handed out by admins, so they must be unguessable:
// crypto-random (not Math.random) and 14 chars from a 32-char set (~70 bits).
export function generateTempPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  return Array.from({ length: 14 }, () => chars[randomInt(chars.length)]).join('')
}
