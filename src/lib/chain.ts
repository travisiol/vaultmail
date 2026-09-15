import { defineChain, type Chain } from "viem";

/**
 * Where payments settle. Robinhood Chain (id 4663) by default; the local
 * Hardhat node (id 31337) when NEXT_PUBLIC_VAULT_CHAIN_ID says so, which is
 * how the end-to-end script pays an invoice for real without touching
 * mainnet. Mail itself is chain-agnostic: an address is an address.
 */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_VAULT_CHAIN_ID ?? 4663);

const ROBINHOOD_RPC = process.env.NEXT_PUBLIC_VAULT_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const ROBINHOOD_EXPLORER = process.env.NEXT_PUBLIC_VAULT_EXPLORER_URL ?? "https://robinhoodchain.blockscout.com";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_RPC] } },
  blockExplorers: { default: { name: "Robinhood Chain Explorer", url: ROBINHOOD_EXPLORER } },
  testnet: false,
});

export const localChain = defineChain({
  id: 31337,
  name: "Local Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_VAULT_RPC_URL ?? "http://127.0.0.1:8545"] } },
  testnet: true,
});

export const chain: Chain = CHAIN_ID === localChain.id ? localChain : robinhoodChain;

export function explorerTx(hash: string): string | null {
  const base = chain.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : null;
}

export function explorerAddress(address: string): string | null {
  const base = chain.blockExplorers?.default.url;
  return base ? `${base}/address/${address}` : null;
}
