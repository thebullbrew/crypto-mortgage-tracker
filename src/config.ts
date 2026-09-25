import "dotenv/config";
import { defineChain, parseEther } from "viem";

/** Ethereum (chain id 1). */
export const chain = defineChain({
  id: 1,
  name: "Ethereum",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://eth.llamarpc.com"] } },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://etherscan.io" },
  },
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function bigIntEnv(name: string, fallback: string): bigint {
  const raw = process.env[name] ?? fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a non-negative integer, got "${raw}".`);
  }
  return BigInt(raw);
}

function addressEnv(name: string): `0x${string}` | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
    throw new Error(`${name} must be a 20-byte hex address, got "${raw}".`);
  }
  return normalized as `0x${string}`;
}

function keyEnv(name: string): `0x${string}` {
  const raw = required(name);
  const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`${name} must be a 64-character hex private key (0x prefix optional).`);
  }
  return normalized as `0x${string}`;
}

export const config = {
  /** JSON-RPC endpoint for Ethereum. */
  rpcUrl: required("RPC_URL"),
  /** Deployer private key (validated 32-byte hex). */
  privateKey: keyEnv("PRIVATE_KEY"),
  /** Block explorer base URL — used for links only. */
  explorerUrl: "https://etherscan.io",

  collectionName: process.env.COLLECTION_NAME ?? "My Collection",
  collectionSymbol: process.env.COLLECTION_SYMBOL ?? "MYC",
  maxSupply: bigIntEnv("MAX_SUPPLY", "10000"),
  maxPerWallet: bigIntEnv("MAX_PER_WALLET", "5"),
  /** Mint price in wei (parsed from MINT_PRICE, denominated in ETH). */
  mintPriceWei: parseEther(process.env.MINT_PRICE ?? "0.05"),
  /** Base URI for token metadata — token #1 resolves to BASE_URI + "1". */
  baseUri: process.env.BASE_URI ?? "ipfs://YOUR_CID/",

  /** Set after `npm run deploy`. */
  contractAddress: addressEnv("CONTRACT_ADDRESS"),
  /** Mint recipient — defaults to the deployer wallet. */
  mintTo: addressEnv("MINT_TO"),
  mintQuantity: bigIntEnv("MINT_QUANTITY", "1"),
};
