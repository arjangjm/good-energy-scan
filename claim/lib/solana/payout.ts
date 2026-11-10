import { ComputeBudgetProgram, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';

export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
export const USDC_DECIMALS = 6;
// Measured about 31,000 units when the payout also creates the token account. 60,000 leaves room.
export const COMPUTE_UNIT_LIMIT = 60_000;

// A wallet we can pay: a real ed25519 address that is not the treasury itself.
export function isValidRecipient(address: string, treasury?: string): boolean {
  try {
    const bytes = bs58.decode(address);
    if (bytes.length !== 32) return false;
    if (treasury && address === treasury) return false;
    return PublicKey.isOnCurve(bytes);
  } catch { return false; }
}

export function buildSignedPayout(a: {
  treasury: Keypair; mint: PublicKey; recipient: PublicKey; amount: bigint; memo: string;
  blockhash: string; lastValidBlockHeight: number; microLamports: number;
}): { signature: string; rawBase64: string; lastValidBlockHeight: number } {
  const from = getAssociatedTokenAddressSync(a.mint, a.treasury.publicKey);
  const to = getAssociatedTokenAddressSync(a.mint, a.recipient);
  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: a.microLamports }),
    createAssociatedTokenAccountIdempotentInstruction(a.treasury.publicKey, to, a.recipient, a.mint),
    createTransferCheckedInstruction(from, a.mint, to, a.treasury.publicKey, a.amount, USDC_DECIMALS),
    new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(a.memo, 'utf8') }),
  );
  tx.recentBlockhash = a.blockhash;
  tx.lastValidBlockHeight = a.lastValidBlockHeight;
  tx.feePayer = a.treasury.publicKey;
  tx.sign(a.treasury);
  return { signature: bs58.encode(tx.signature!), rawBase64: tx.serialize().toString('base64'), lastValidBlockHeight: a.lastValidBlockHeight };
}
