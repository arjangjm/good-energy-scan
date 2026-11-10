import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getEnv } from './env';
import { getSession } from './db';
import { COOKIE, hashToken } from './session';

// Money-moving requests must come from our own pages.
export function sameOrigin(req: Request): boolean {
  return req.headers.get('origin') === getEnv().PUBLIC_BASE_URL;
}
export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
}
export async function sessionFrom(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  return token ? getSession(hashToken(token)) : null;
}
export function isAdmin(req: Request): boolean {
  const got = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer /, ''));
  const want = Buffer.from(getEnv().ADMIN_TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
}
