// A ChainClient backed by LiteSVM, an in-process Solana VM. Tests only.
import { LiteSVM } from 'litesvm';
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import {
  AccountLayout, MINT_SIZE, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction, createMintToCheckedInstruction, getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { ChainClient, SigStatus, SimulationFailed } from '@/lib/solana/chain';

export class LiteChain implements ChainClient {
  svm = new LiteSVM();
  treasury: Keypair;
  mint: Keypair;
  height = 1000;
  dropSends = false;       // pretend the network loses every send
  failNextPreflightWith: Error | null = null;
  sends = 0;
  lastLogs: string[] = [];
  lastCu = 0n;
  statuses = new Map<string, { ok: boolean; err: unknown }>();

  constructor(usdcUnits = 4_000_000n, treasury = Keypair.generate(), lamports = BigInt(LAMPORTS_PER_SOL), mint = Keypair.generate()) {
    this.treasury = treasury;
    this.mint = mint;
    this.svm.airdrop(treasury.publicKey, lamports);
    const rent = this.svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE));
    const ata = getAssociatedTokenAddressSync(this.mint.publicKey, treasury.publicKey);
    const tx = new Transaction().add(
      SystemProgram.createAccount({ fromPubkey: treasury.publicKey, newAccountPubkey: this.mint.publicKey, lamports: Number(rent), space: MINT_SIZE, programId: TOKEN_PROGRAM_ID }),
      createInitializeMint2Instruction(this.mint.publicKey, 6, treasury.publicKey, null),
      createAssociatedTokenAccountIdempotentInstruction(treasury.publicKey, ata, treasury.publicKey, this.mint.publicKey),
    );
    if (usdcUnits > 0n) tx.add(createMintToCheckedInstruction(this.mint.publicKey, ata, treasury.publicKey, usdcUnits, 6));
    tx.recentBlockhash = this.svm.latestBlockhash();
    tx.feePayer = treasury.publicKey;
    tx.sign(treasury, this.mint);
    const res = this.svm.sendTransaction(tx);
    if (res.constructor.name !== 'TransactionMetadata') throw new Error('LiteChain setup failed: ' + res.toString());
  }

  tokenBalance(owner: PublicKey): bigint | null {
    const acc = this.svm.getAccount(getAssociatedTokenAddressSync(this.mint.publicKey, owner, true));
    return acc ? AccountLayout.decode(Buffer.from(acc.data)).amount : null;
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
  async balances(owner: PublicKey, _mint: PublicKey) {
    const acc = this.svm.getAccount(owner);
    return { lamports: acc ? BigInt(acc.lamports) : 0n, units: this.tokenBalance(owner) ?? 0n };
  }
  async priorityFee() { return 50_000; }
}
