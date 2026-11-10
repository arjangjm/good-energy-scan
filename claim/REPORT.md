# Build report

Last updated: Nov 10, 2026, 02:00 (Sao Paulo).

## Status

| Step | State |
|---|---|
| Claim site | Live at https://ge-scan.vercel.app |
| Automated tests | 38 unit and database tests pass, 5 browser tests pass |
| Treasury | `7JF86zcnGQ2qzsU3B5MVr9RwakqmwfKJxrcKRRE3tM1T`. Waiting for 4 USDC and 0.01 SOL. |
| 1-cent mainnet test | Code minted (`codes-smoke.csv`). Runs once the treasury is funded: `npx tsx scripts/smoke-mainnet.ts .env.production.local codes-smoke.csv` |
| iPhone test | 4 codes minted (`codes-iphone-test.csv`). Sheet built: `sheets/good-energy-iphone-test.pdf` |

## Calls made during the build (rulings)

1. Built on Arjang's Mac, not in the cloud workspace. The workspace cannot reach Vercel or the database port. Cost if wrong: none, the code is the same.
2. Compute limit is 60,000 units, not the plan's 45,000. A payout that creates a token account measured 26,712, and that number moves with the address. Cost: at most 0.00006 SOL more per payout at the fee cap.
3. Content-Security-Policy allows inline scripts. Next.js needs them to start the page. Cost if wrong: weaker protection against script injection. The pages render no user-written HTML.
4. One call to `/api/connect/prepare` returns both wallet links, and it needs the 18+ box ticked. The plan had one call per wallet. Cost: none.
5. Env vars are set for Production only, not Preview. A preview build should never hold the treasury key.
6. The test sheet shows one QR per page (8 pages), not two per page. A camera that sees two codes can open the wrong one.
7. The all-caps QR for code #4 is one size up (37x37, not 33x33). At 33x33 one of the four test readers failed on a blurred copy.
8. Funding QR codes are made with a short Python script, not `treasury.ts`. One less dependency.
9. Test rows in the database are marked failed or void, not deleted. The app's database role cannot delete, by design. They do not count toward limits. Scan numbers start in the 20s because of them.
10. Broadcast waits 18 seconds inside a request, not 25, to stay inside the 30 second function limit. The status poll finishes anything still in flight.
11. The visual pass with Impeccable is not done. The page uses the brand colors and smiley and is tidy, but a design pass is still open.
12. The branch is committed on the Mac but not pushed. The repo is public, so pushing is Arjang's call.

## Not done yet

- Mainnet 1-cent test and the iPhone test (waiting on funds).
- Final reconcile of payouts against the treasury balance.
