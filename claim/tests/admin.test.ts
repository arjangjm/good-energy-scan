import { afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/admin/[action]/route';
import { getEnv } from '@/lib/env';
import { hashCode, normalizeCode } from '@/lib/codes';
import { closeDb, lookupCode } from '@/lib/db';
import { retireBatch } from './helpers';

const BATCH = 'test-admin';
const call = (action: string, method: 'GET' | 'POST', token: string, body?: unknown) => {
  const req = new NextRequest(`http://localhost:3000/api/admin/${action}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  return (method === 'GET' ? GET : POST)(req, { params: Promise.resolve({ action }) });
};
afterAll(async () => { await retireBatch(BATCH); await closeDb(); });

describe('admin api @db', () => {
  it('answers 404 to a wrong token', async () => {
    expect((await call('health', 'GET', 'wrong')).status).toBe(404);
    expect((await call('mint', 'POST', 'wrong', { count: 1, batch: BATCH, amountBaseUnits: 1 })).status).toBe(404);
  });
  it('mints codes, returns them once, and stores only hashes', async () => {
    const res = await call('mint', 'POST', getEnv().ADMIN_TOKEN, { count: 3, batch: BATCH, amountBaseUnits: 990000 });
    const j = await res.json();
    expect(j.codes).toHaveLength(3);
    for (const c of j.codes) {
      expect(normalizeCode(c.code)).toBe(c.code);
      expect(c.url).toBe(`http://localhost:3000/c/${c.code}`);
      expect((await lookupCode(hashCode(c.code, getEnv().CODE_PEPPER)))!.status).toBe('available');
    }
  });
  it('reports health', async () => {
    const j = await (await call('health', 'GET', getEnv().ADMIN_TOKEN)).json();
    for (const k of ['treasury', 'lamports', 'payoutsEnabled', 'claimsLastHour', 'pending']) expect(j).toHaveProperty(k);
  });
  it('refuses a sweep without the confirm word', async () => {
    expect((await call('sweep', 'POST', getEnv().ADMIN_TOKEN, { toWallet: '11111111111111111111111111111111' })).status).toBe(400);
  });
});
