// A ChainClient backed by LiteSVM, an in-process Solana VM. Tests only.
import { LiteSVM } from 'litesvm';
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { ChainClient, SigStatus, SimulationFailed } from '@/lib/solana/chain';
import { PYTH_RECEIVER, PYTH_SOL_USD } from '@/lib/solana/price';
import { pythData } from './pyth';

export const SOL_AT_100 = 10_000_000_000n; // $100 per SOL in Pyth's units (exponent -8)

export class LiteChain implements ChainClient {
  svm = new LiteSVM();
  treasury: Keypair;
  height = 1000;
  dropSends = false;       // pretend the network loses every send
  failNextPreflightWith: Error | null = null;
  sends = 0;
  lastLogs: string[] = [];
  lastCu = 0n;
  statuses = new Map<string, { ok: boolean; err: unknown }>();

  constructor(lamports = BigInt(LAMPORTS_PER_SOL), treasury = Keypair.generate()) {
    this.treasury = treasury;
    this.svm.airdrop(treasury.publicKey, lamports);
    this.setSolPrice(SOL_AT_100);
  }

  // Writes Pyth's SOL/USD account, published now unless told otherwise.
  setSolPrice(price: bigint, publishTime = Math.floor(Date.now() / 1000)) {
    this.svm.setAccount(PYTH_SOL_USD, {
      lamports: LAMPORTS_PER_SOL, data: pythData({ price, publishTime }), owner: PYTH_RECEIVER, executable: false,
    });
  }

  lamportsOf(owner: PublicKey): bigint {
    return BigInt(this.svm.getAccount(owner)?.lamports ?? 0);
  }

  async latestBlockhash() {
    this.svm.expireBlockhash();
    return { blockhash: this.svm.latestBlockhash(), lastValidBlockHeight: this.height + 150 };
  }
  async blockHeight() { return this.height; }
  async sendRaw(rawBase64: string, skipPreflight: boolean) {
    this.sends++;
    if (!skipPreflight && this.failNextPreflightWith) { const e = this.failNextPreflightWith; this.failNextPreflightWith = null; throw e; }
    if (this.dropSends) return;
    const tx = Transaction.from(Buffer.from(rawBase64, 'base64'));
    const sig = bs58.encode(tx.signature!);
    if (this.statuses.get(sig)?.ok) {
      if (!skipPreflight) throw new SimulationFailed('Transaction simulation failed: This transaction has already been processed');
      return;
    }
    const res: any = this.svm.sendTransaction(tx);
    if (res.constructor.name === 'TransactionMetadata') {
      this.statuses.set(sig, { ok: true, err: null });
      this.lastLogs = res.logs();
      this.lastCu = res.computeUnitsConsumed();
    } else if (!skipPreflight) {
      throw new SimulationFailed('Transaction simulation failed: ' + res.toString());
    }
  }
  async signatureStatus(sig: string): Promise<SigStatus> { return this.statuses.get(sig) ?? null; }
  async balance(owner: PublicKey) { return this.lamportsOf(owner); }
  async account(address: PublicKey) {
    const a = this.svm.getAccount(address);
    return a ? { owner: a.owner, data: a.data } : null;
  }
  async priorityFee() { return 50_000; }
}
