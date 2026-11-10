import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import bs58 from 'bs58';

export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
// Measured about 13,200 units for the transfer plus the memo. 30,000 leaves room.
export const COMPUTE_UNIT_LIMIT = 30_000;

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
  treasury: Keypair; recipient: PublicKey; lamports: bigint; memo: string;
  blockhash: string; lastValidBlockHeight: number; microLamports: number;
}): { signature: string; rawBase64: string; lastValidBlockHeight: number } {
  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: a.microLamports }),
    SystemProgram.transfer({ fromPubkey: a.treasury.publicKey, toPubkey: a.recipient, lamports: a.lamports }),
    new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(a.memo, 'utf8') }),
  );
  tx.recentBlockhash = a.blockhash;
  tx.lastValidBlockHeight = a.lastValidBlockHeight;
  tx.feePayer = a.treasury.publicKey;
  tx.sign(a.treasury);
  return { signature: bs58.encode(tx.signature!), rawBase64: tx.serialize().toString('base64'), lastValidBlockHeight: a.lastValidBlockHeight };
}
