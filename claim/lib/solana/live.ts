import { ChainClient, rpcChain } from './chain';
import { getEnv } from '../env';

let chain: ChainClient | undefined;
export function getChain(): ChainClient {
  return (chain ??= rpcChain(getEnv().RPC_URL));
}
