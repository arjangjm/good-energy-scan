import { expect, test } from '@playwright/test';
import { Keypair } from '@solana/web3.js';
import { getEnv } from '../lib/env';
import { generateCode, hashCode } from '../lib/codes';
import { closeDb, insertCodes, lookupCode, sql } from '../lib/db';

const BATCH = 'test-e2e';
async function newCode() {
  const code = generateCode();
  await insertCodes([{ codeHash: hashCode(code, getEnv().CODE_PEPPER), batch: BATCH, amount: 990000n }]);
  return code;
}
test.afterAll(async () => {
  await sql()`update codes set status = 'void' where batch = ${BATCH}`;
  await closeDb();
});

test('an unclaimed code shows live wallet links once 18+ is ticked', async ({ page }) => {
  const code = await newCode();
  await page.goto(`/c/${code}`);
  await expect(page.getByRole('heading', { name: 'This can has $0.99 for you.' })).toBeVisible();
  await page.getByLabel("I'm 18 or older").check();
  await expect(page.getByRole('link', { name: 'Phantom', exact: true })).toHaveAttribute('href', /^https:\/\/phantom\.com\/ul\/v1\/connect\?/);
  await expect(page.getByRole('link', { name: 'Solflare', exact: true })).toHaveAttribute('href', /^https:\/\/solflare\.com\/ul\/v1\/connect\?/);
  const href = await page.getByRole('link', { name: 'Phantom', exact: true }).getAttribute('href');
  expect(new URL(href!).searchParams.get('redirect_link')).toMatch(/^http:\/\/localhost:3000\/cb\/[0-9a-f-]{36}$/);
});

test('opening the page, even 5 times, never uses up the code', async ({ page }) => {
  const code = await newCode();
  for (let i = 0; i < 5; i++) await page.goto(`/c/${code}`);
  expect((await lookupCode(hashCode(code, getEnv().CODE_PEPPER)))!.status).toBe('available');
});

test('an all-caps link and a lowercase code both work', async ({ page }) => {
  const code = await newCode();
  await page.goto(`/C/${code}`);
  await expect(page.getByRole('heading', { name: 'This can has $0.99 for you.' })).toBeVisible();
  await page.goto(`/c/${code.toLowerCase()}`);
  await expect(page.getByRole('heading', { name: 'This can has $0.99 for you.' })).toBeVisible();
});

test('a wrong code says so', async ({ page }) => {
  await page.goto('/c/NOTAREALCODE12345');
  await expect(page.getByText("This code doesn't look right.")).toBeVisible();
  await expect(page.getByText('Try scanning again.')).toBeVisible();
});

test('pasting an address with 18+ ticked gets to the Claim button', async ({ page }) => {
  const code = await newCode();
  await page.goto(`/c/${code}`);
  await page.getByLabel("I'm 18 or older").check();
  await page.getByRole('button', { name: 'Other wallet' }).click();
  const wallet = Keypair.generate().publicKey.toBase58();
  await page.getByLabel('Your Solana address').fill(wallet);
  await page.getByRole('button', { name: 'Use this address' }).click();
  await expect(page.getByRole('button', { name: 'Claim $0.99' })).toBeVisible();
  await expect(page.getByText(`to ${wallet.slice(0, 4)}…${wallet.slice(-4)}`)).toBeVisible();
});
