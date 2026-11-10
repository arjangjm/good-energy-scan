import { createHash, randomBytes } from 'node:crypto';

export const COOKIE = 'ge_s';
export const COOKIE_MAX_AGE = 15552000; // 180 days

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
// The browser keeps the token. The database keeps only its hash.
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}
export function cookieOptions(baseUrl: string) {
  return { httpOnly: true, secure: baseUrl.startsWith('https://'), sameSite: 'lax' as const, path: '/', maxAge: COOKIE_MAX_AGE };
}
