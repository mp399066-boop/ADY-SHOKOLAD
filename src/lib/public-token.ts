// Server-only: unguessable tokens for public links (quote approval, order form).
import { randomBytes } from 'crypto';

export function newPublicToken(): string {
  return randomBytes(24).toString('base64url'); // 32 chars, 192 bits
}
