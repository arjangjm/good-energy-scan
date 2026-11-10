import { z } from 'zod';
import bs58 from 'bs58';

const schema = z.object({
  PUBLIC_BASE_URL: z.string().url().transform((s) => s.replace(/\/+$/, '')),
  RPC_URL: z.string().url(),
  USDC_MINT: z.string().min(32),
  TREASURY_SECRET_KEY: z.string().refine((s) => {
    try { return bs58.decode(s).length === 64; } catch { return false; }
  }, 'must be base58 of 64 bytes'),
  CODE_PEPPER: z.string().regex(/^[0-9a-f]{64}$/i, 'must be 64 hex characters'),
  ADMIN_TOKEN: z.string().min(24),
  DATABASE_URL: z.string().startsWith('postgres'),
});

export type Env = z.infer<typeof schema>;
const KEYS = Object.keys(schema.shape) as (keyof Env)[];

export function parseEnv(src: Record<string, string | undefined>): Env {
  const picked: Record<string, string | undefined> = {};
  for (const k of KEYS) picked[k] = src[k] === '' ? undefined : src[k];
  const r = schema.safeParse(picked);
  if (!r.success) {
    const names = [...new Set(r.error.issues.map((i) => `${i.path.join('.')} (${i.message})`))];
    throw new Error(`Bad or missing env: ${names.join(', ')}`);
  }
  return r.data;
}

let cached: Env | undefined;
export function getEnv(): Env {
  return (cached ??= parseEnv(process.env));
}
