import { createHash } from 'node:crypto'

export function hashSha256(valor: Buffer | string): string {
  return createHash('sha256').update(valor).digest('hex')
}