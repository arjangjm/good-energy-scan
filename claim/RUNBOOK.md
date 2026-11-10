# Runbook

`B=https://ge-scan.vercel.app` and `T=<ADMIN_TOKEN>` (in `.env.production.local` on Arjang's Mac, and in Vercel).

| Need | Do |
|---|---|
| See the treasury balance and payout state | `curl -H "authorization: Bearer $T" $B/api/admin/health` |
| Stop all payouts now | `curl -X POST -H "authorization: Bearer $T" $B/api/admin/pause` |
| Start them again | `curl -X POST -H "authorization: Bearer $T" $B/api/admin/resume` |
| Mint codes | `npx tsx scripts/mint-test-codes.ts .env.production.local <count> <batch> <units>` |
| Empty the treasury to a wallet | `curl -X POST -H "authorization: Bearer $T" -H "content-type: application/json" -d '{"toWallet":"<address>","confirm":"SWEEP"}' $B/api/admin/sweep` |

## Low balance

When the treasury has less USDC than a payout, or under 0.0023 SOL, the next claim pauses payouts by itself. The scanner sees "Payouts are paused for a minute" and their can stays good. Top up the treasury, then call `resume`.

## A payout looks stuck

Open `claims` in Supabase. `signed` means a transaction was sent and the server is still watching it. Loading `/api/claim/<id>` nudges it. It settles by itself within about 90 seconds: paid, or expired and sent again. `failed` rows free the code, so the can still works.

## Rotate a key

- Admin token or code pepper: change it in Vercel (`vercel env rm`, `vercel env add ... --sensitive`), then redeploy. A new pepper kills every code minted before it.
- Treasury: sweep the old one, generate a new key in a fresh env file with `scripts/treasury.ts generate`, set it in Vercel, redeploy, fund it.
- Database password: `alter role ge_api password '...'` in Supabase, update `DATABASE_URL` in Vercel, redeploy.

## Deploy

`npx vercel deploy --prod` from this folder. Env vars live in Vercel (Production only). `.env*` files are never uploaded.
