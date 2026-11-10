import { createHmac, randomBytes } from 'node:crypto';

// Crockford base32: no I, L, O or U, so a code read off a can is hard to mistype.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateCode(): string {
  let bits = 0n;
  for (const b of randomBytes(10)) bits = (bits << 8n) | BigInt(b); // 80 bits
  let out = '';
  for (let i = 15; i >= 0; i--) out += ALPHABET[Number((bits >> BigInt(i * 5)) & 31n)];
  return out;
}

export function normalizeCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(s) ? s : null;
}

export function hashCode(code: string, pepper: string): string {
  return createHmac('sha256', Buffer.from(pepper, 'hex')).update(`code:${code}`).digest('hex');
}

export function hashIp(ip: string, pepper: string): string {
  return createHmac('sha256', Buffer.from(pepper, 'hex')).update(`ip:${ip}`).digest('hex');
}

export function claimUrl(base: string, code: string): string {
  return `${base.replace(/\/+$/, '')}/c/${code}`;
}
