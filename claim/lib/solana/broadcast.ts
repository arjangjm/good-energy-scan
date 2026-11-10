import { ChainClient, SimulationFailed } from './chain';

export type Outcome = 'confirmed' | 'failed' | 'expired' | 'pending';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Blocks to wait past lastValidBlockHeight before calling a transaction dead. Covers RPC nodes that lag.
export const EXPIRY_MARGIN = 5;

// A transaction is dead only when the chain has moved past its last valid block AND has no record of it.
export async function isExpired(chain: ChainClient, sig: string, lastValidBlockHeight: number): Promise<Outcome | null> {
  const height = await chain.blockHeight();
  if (height <= lastValidBlockHeight + EXPIRY_MARGIN) return null;
  const st = await chain.signatureStatus(sig);
  if (st === null) return 'expired';
  if (st.ok) return 'confirmed';
  if (st.err) return 'failed';
  return null;
}

// Sends the SAME signed bytes until the chain gives an answer. It never signs anything.
export async function broadcastUntilSettled(
  chain: ChainClient, rawBase64: string, sig: string, lastValidBlockHeight: number,
  opts: { timeoutMs?: number; pollMs?: number; resendMs?: number } = {},
): Promise<Outcome> {
  const timeoutMs = opts.timeoutMs ?? 25_000, pollMs = opts.pollMs ?? 500, resendMs = opts.resendMs ?? 2_000;
  const start = Date.now();
  try {
    await chain.sendRaw(rawBase64, false);
  } catch (e) {
    if (e instanceof SimulationFailed) {
      // Simulation also fails for a transaction that already landed. Check before giving up.
      const st = await chain.signatureStatus(sig).catch(() => undefined);
      if (st?.ok) return 'confirmed';
      if (!/already been processed/i.test(e.message)) return 'failed';
    }
    // Any other error (timeout, network): it may have been sent. Keep watching.
  }
  let lastSend = Date.now(), lastHeightCheck = 0;
  for (;;) {
    const st = await chain.signatureStatus(sig).catch(() => undefined);
    if (st?.ok) return 'confirmed';
    if (st?.err) return 'failed';
    if (st === null && Date.now() - lastHeightCheck >= resendMs) {
      lastHeightCheck = Date.now();
      const dead = await isExpired(chain, sig, lastValidBlockHeight).catch(() => null);
      if (dead) return dead;
    }
    if (Date.now() - start >= timeoutMs) return 'pending';
    if (Date.now() - lastSend >= resendMs) {
      lastSend = Date.now();
      chain.sendRaw(rawBase64, true).catch(() => {});
    }
    await sleep(pollMs);
  }
}
