import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'

export const MIN_PASSWORD_LENGTH = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// Starting password for new users, admin resets and approved requests.
// Uses the team's shared default from the VCOS_DEFAULT_PASSWORD env var
// (set in .env / Netlify, never in this public repo). Users can change it
// at /account/password. If the env var is unset, falls back to a
// crypto-random 14-char password (~70 bits).
export function generateTempPassword(): string {
  const shared = process.env.VCOS_DEFAULT_PASSWORD?.trim()
  if (shared) return shared
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  return Array.from({ length: 14 }, () => chars[randomInt(chars.length)]).join('')
}
