import { describe, expect, it } from 'vitest';
import { claimUrl, generateCode, hashCode, normalizeCode } from '@/lib/codes';

describe('codes', () => {
  it('generates 16 characters from the alphabet, all distinct', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      const c = generateCode();
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
      seen.add(c);
    }
    expect(seen.size).toBe(10000);
  });
  it('normalizes spacing, dashes and case', () => {
    expect(normalizeCode('7k2m-9qxh 4twd-8rna')).toBe('7K2M9QXH4TWD8RNA');
  });
  it('reads I and L as 1, O as 0', () => {
    expect(normalizeCode('IL0O' + 'A'.repeat(12))).toBe('1100' + 'A'.repeat(12));
  });
  it('rejects U and wrong lengths', () => {
    expect(normalizeCode('U'.repeat(16))).toBeNull();
    expect(normalizeCode('A'.repeat(15))).toBeNull();
    expect(normalizeCode('A'.repeat(17))).toBeNull();
  });
  it('hashes to 64 hex, stable', () => {
    const p = 'ab'.repeat(32);
    expect(hashCode('7K2M9QXH4TWD8RNA', p)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode('7K2M9QXH4TWD8RNA', p)).toBe(hashCode('7K2M9QXH4TWD8RNA', p));
  });
  it('builds the claim url', () => {
    expect(claimUrl('https://ge-scan.vercel.app', 'ABC')).toBe('https://ge-scan.vercel.app/c/ABC');
  });
});
