import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getEnv } from './env';

let kp: Keypair | undefined;
export function treasuryKeypair(): Keypair {
  return (kp ??= Keypair.fromSecretKey(bs58.decode(getEnv().TREASURY_SECRET_KEY)));
}
export function treasuryAddress(): string {
  return treasuryKeypair().publicKey.toBase58();
}
