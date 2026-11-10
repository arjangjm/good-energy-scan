# Good Energy: scan to earn

Scan the QR on a can with a phone camera. A web page opens. Connect Phantom or Solflare once. Tap Claim. 33% of the can price lands in your wallet in SOL, priced when you claim. Each code pays once.

Live test site: https://ge-scan.vercel.app

## How it works

1. The QR holds a link like `https://ge-scan.vercel.app/c/7K2M9QXH4TWD8RNA`. The 16-character code is the secret. The database stores only a keyed hash of it.
2. The page is read-only. Opening it, or a link preview fetching it, never uses up a code.
3. Connect: the Phantom and Solflare buttons are deeplinks. The wallet app sends the address back to `/cb/<id>`, encrypted. The server holds the key, so it works even when iOS opens a new tab. We only read the address. Nobody signs anything.
4. Claim: `POST /api/claim` reserves the code in one database transaction, then a server wallet (the treasury) sends the code's dollar amount in SOL, at Pyth's SOL/USD price on Solana at that moment, rounded down. The transaction is signed once and saved before it is sent. A retry resends the same bytes. A new one is signed only after the first can no longer land. That is what stops a double pay.

## Layout

| Path | What |
|---|---|
| `app/c/[code]` | The claim page |
| `app/cb/[state]` | Wallet callback |
| `app/api/claim` | Start a payout, and poll its status |
| `app/api/admin/[action]` | `mint`, `health`, `pause`, `resume`, `sweep` (needs `ADMIN_TOKEN`) |
| `lib/claim.ts` | The claim state machine |
| `lib/solana/` | Build, sign, send and confirm the payout |
| `lib/wallets/deeplink.ts` | Phantom and Solflare links and decryption |
| `supabase/migrations/` | Tables and the `reserve_code` function |
| `qr/ge_qr.py` | Draws any link as a Good Energy smiley QR and checks that it scans |
| `scripts/` | Treasury key, minting codes, the mainnet dry run, the iPhone test sheet |

## Run it

```bash
npm install --include=dev
cp .env.example .env.local        # fill it in
npx tsx scripts/treasury.ts generate .env.local
npm run dev
```

Tests: `npm test` (unit tests plus tests against the real database, no money), `npm run e2e` (browser tests in Chrome).
If your shell sets `NODE_ENV=production`, run `unset NODE_ENV` first, or dev dependencies get skipped.

Mainnet dry run: `npx tsx scripts/dry-run-mainnet.ts .env.production.local <wallet>` builds a real $0.99 payout, simulates it on mainnet, and sends nothing.

## Make codes and QR art

```bash
npx tsx scripts/mint-test-codes.ts .env.production.local 4 my-batch 990000   # $0.99 each, writes codes-my-batch.csv
python3.11 -m venv .venv && .venv/bin/pip install segno pillow numpy zxing-cpp opencv-python-headless pyzbar
.venv/bin/python scripts/make-test-sheet.py codes-my-batch.csv sheets/my-batch.pdf
.venv/bin/python qr/ge_qr.py --url https://ge-scan.vercel.app/c/<CODE> --out out/can   # one QR, black and white
```

`ge_qr.py` exits with an error if any reader fails to decode the art, so a bad code never reaches print.

## Limits in this test build

10 claims per wallet per day, 20 per IP per hour, 20 per hour in total, $10 of payouts per day in total. They live in the `settings` table.
