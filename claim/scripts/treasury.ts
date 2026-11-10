// The treasury is the wallet that pays scanners.
//   npx tsx scripts/treasury.ts generate <envfile>   make a new key, save it in the env file, print only the address
//   npx tsx scripts/treasury.ts address <envfile>    print the address and a funding link
import { readFileSync, writeFileSync } from 'node:fs';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const [cmd, file] = process.argv.slice(2);
if (!cmd || !file) { console.error('usage: treasury.ts generate|address <envfile>'); process.exit(1); }
const text = readFileSync(file, 'utf8');
const current = /^TREASURY_SECRET_KEY=(.*)$/m.exec(text)?.[1]?.trim() ?? '';

function show(kp: Keypair) {
  const a = kp.publicKey.toBase58();
  console.log('treasury address:', a);
  console.log('fund SOL: ', `solana:${a}?amount=0.01&label=Good%20Energy%20test`);
}

if (cmd === 'generate') {
  // Never replace a key that may hold money.
  if (current) { console.error('This env file already has a treasury key. Not replacing it.'); process.exit(1); }
  const kp = Keypair.generate();
  const line = `TREASURY_SECRET_KEY=${bs58.encode(kp.secretKey)}`;
  writeFileSync(file, /^TREASURY_SECRET_KEY=.*$/m.test(text) ? text.replace(/^TREASURY_SECRET_KEY=.*$/m, line) : `${text.trimEnd()}\n${line}\n`, { mode: 0o600 });
  show(kp);
} else if (cmd === 'address') {
  if (!current) { console.error('No treasury key in this env file.'); process.exit(1); }
  show(Keypair.fromSecretKey(bs58.decode(current)));
} else { console.error('unknown command'); process.exit(1); }
