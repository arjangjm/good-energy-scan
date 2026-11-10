# Preflight (Nov 10, 2026)

| Check | Result | Path chosen |
|---|---|---|
| Solana mainnet RPC reachable | PASS | Public RPC `https://api.mainnet-beta.solana.com`. Fine for a test. Use a paid RPC for launch. |
| Vercel access | PASS | Arjang signed in once in the browser pane. CLI logged in on his Mac. Project `ge-scan`. |
| Supabase project | PASS | `good-energy-scan` (`rtoufwlqfpiraczxnvap`), org uBee Agency LLC, us-east-2. "uBee Damiana" untouched. |
| Database role | PASS | `ge_api` over the transaction pooler at `aws-0-us-east-2.pooler.supabase.com:6543`. |
| Code home | PASS | Built on Arjang's Mac in `~/good-energy-scan`, branch `claim-web`, folder `claim/`. The cloud workspace cannot reach Vercel or the database port. |
