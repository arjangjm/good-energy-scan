import { describe, expect, it } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import { walletCallback } from './helpers';
import { BadCallback, browseUrl, connectUrl, decryptConnect, Provider, WalletRejected } from '@/lib/wallets/deeplink';

describe('wallet deeplinks', () => {
  for (const p of ['phantom', 'solflare'] as Provider[]) {
    it(`decrypts the ${p} connect callback`, () => {
      const dapp = nacl.box.keyPair();
      const address = Keypair.generate().publicKey.toBase58();
      expect(decryptConnect(p, walletCallback(p, dapp.publicKey, address), dapp.secretKey).publicKey).toBe(address);
    });
  }
  it('throws WalletRejected when the user says no', () => {
    const q = new URLSearchParams({ errorCode: '4001', errorMessage: 'User rejected the request.' });
    expect(() => decryptConnect('phantom', q, nacl.box.keyPair().secretKey)).toThrow(WalletRejected);
  });
  it('throws BadCallback on tampered data and on the wrong provider key name', () => {
    const dapp = nacl.box.keyPair();
    const q = walletCallback('phantom', dapp.publicKey, Keypair.generate().publicKey.toBase58());
    const bytes = bs58.decode(q.get('data')!); bytes[3] ^= 1;
    const bad = new URLSearchParams(q); bad.set('data', bs58.encode(bytes));
    expect(() => decryptConnect('phantom', bad, dapp.secretKey)).toThrow(BadCallback);
    expect(() => decryptConnect('solflare', q, dapp.secretKey)).toThrow(BadCallback);
  });
  it('builds connect and browse links on the right hosts', () => {
    const a = { appUrl: 'https://ge-scan.vercel.app', redirectLink: 'https://ge-scan.vercel.app/cb/abc', dappPublicKey: 'KEY', cluster: 'mainnet-beta' as const };
    const ph = connectUrl('phantom', a), sf = connectUrl('solflare', a);
    expect(ph.startsWith('https://phantom.com/ul/v1/connect?')).toBe(true);
    expect(sf.startsWith('https://solflare.com/ul/v1/connect?')).toBe(true);
    for (const k of ['app_url=', 'dapp_encryption_public_key=KEY', 'redirect_link=https%3A%2F%2Fge-scan.vercel.app%2Fcb%2Fabc', 'cluster=mainnet-beta']) expect(ph).toContain(k);
    expect(browseUrl('phantom', 'https://a.b/c/X', 'https://a.b')).toBe('https://phantom.com/ul/browse/https%3A%2F%2Fa.b%2Fc%2FX?ref=https%3A%2F%2Fa.b');
    expect(browseUrl('solflare', 'https://a.b/c/X', 'https://a.b')).toBe('https://solflare.com/ul/v1/browse/https%3A%2F%2Fa.b%2Fc%2FX?ref=https%3A%2F%2Fa.b');
  });
});
