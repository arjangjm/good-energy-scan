# Build report

Last updated: Nov 10, 2026, 19:10 (Sao Paulo).

## Status

| Step | State |
|---|---|
| Claim site | Live at https://ge-scan.vercel.app |
| Payout | $0.99 a scan, paid in SOL at Pyth's SOL/USD price when the claim runs. Switched from USDC on Nov 10. |
| Automated tests | 45 unit and database tests pass, 5 browser tests pass |
| Treasury | `7JF86zcnGQ2qzsU3B5MVr9RwakqmwfKJxrcKRRE3tM1T` started with 0.03 SOL. After 2 payouts it holds about 0.0068 SOL. |
| Mainnet dry run | Passes. A real $0.99 payout (0.01152 SOL at $85.94) to Arjang's wallet was built and simulated on mainnet: valid, 13,232 compute units, exact amount. Nothing was sent. |
| iPhone test | Ran Nov 10. Two $0.99 payouts confirmed on mainnet (scans #37 and #38). |
| Leftover SOL | Goes back to Arjang's wallet with the sweep in RUNBOOK. Arjang runs it. |

## Calls made during the build (rulings)

1. Built on Arjang's Mac, not in the cloud workspace. The workspace cannot reach Vercel or the database port. Cost if wrong: none, the code is the same.
2. Compute limit is 60,000 units, not the plan's 45,000. A payout that creates a token account measured 26,712, and that number moves with the address. Cost: at most 0.00006 SOL more per payout at the fee cap. (Now 30,000. See 16.)
3. Content-Security-Policy allows inline scripts. Next.js needs them to start the page. Cost if wrong: weaker protection against script injection. The pages render no user-written HTML.
4. One call to `/api/connect/prepare` returns both wallet links, and it needs the 18+ box ticked. The plan had one call per wallet. Cost: none.
5. Env vars are set for Production only, not Preview. A preview build should never hold the treasury key.
6. The test sheet shows one QR per page (8 pages), not two per page. A camera that sees two codes can open the wrong one.
7. The all-caps QR for code #4 is one size up (37x37, not 33x33). At 33x33 one of the four test readers failed on a blurred copy.
8. Funding QR codes are made with a short Python script, not `treasury.ts`. One less dependency.
9. Test rows in the database are marked failed or void, not deleted. The app's database role cannot delete, by design. They do not count toward limits. Scan numbers start in the 20s because of them.
10. Broadcast waits 18 seconds inside a request, not 25, to stay inside the 30 second function limit. The status poll finishes anything still in flight.
11. The visual pass with Impeccable is not done. The page uses the brand colors and smiley and is tidy, but a design pass is still open.
12. The branch is on GitHub, pushed on Nov 10 when Arjang asked. The repo is public, so this report leaves out personal wallet addresses.
13. Payouts are SOL, not USDC (Arjang's call, Nov 10). The amount is the code's dollar value at Pyth's SOL/USD price when the claim runs, rounded down. Pyth's web API now needs a key, so the app reads Pyth's price account on Solana through the RPC it already uses. Checked against Coinbase: $86.13 vs $86.11.
14. A price over 5 minutes old, over 2% uncertain, or outside $5 to $10,000 fails the claim and frees the code. It does not pause payouts, because it clears by itself.
15. The 1-cent mainnet test is replaced by a dry run that simulates a $0.99 payout and sends nothing. A 1-cent SOL payout to a new wallet would break Solana's minimum balance rule, and I don't send funds myself.
16. Compute limit is now 30,000 units. A SOL payout measured 13,232, in tests and on mainnet.
17. The treasury keeps a 0.001 SOL floor (0.00065 SOL rent plus fees). When it can't cover a payout plus the floor, payouts pause and the can stays good.
18. No new database columns. Each payout's SOL amount is on chain in its transaction.

## Not done yet

- Final reconcile of payouts against the treasury balance.
- Returning the leftover SOL (Arjang runs the sweep).
