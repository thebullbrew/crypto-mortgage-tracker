import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseEther,
  type Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, config } from "./config";

// Produced by `npx hardhat compile` — this script assumes the artifact exists.
const ARTIFACT_PATH = join(
  __dirname,
  "..",
  "artifacts",
  "contracts",
  "MortgageTracker.sol",
  "MortgageTracker.json"
);

interface ContractArtifact {
  abi: Abi;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

async function main(): Promise<void> {
  if (!existsSync(ARTIFACT_PATH)) {
    throw new Error("Contract artifact not found — run `npx hardhat compile` first, then retry.");
  }
  if (!config.contractAddress) {
    throw new Error("CONTRACT_ADDRESS is not set — deploy first (`npm run deploy`).");
  }
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as ContractArtifact;

  const amountEth = env("AMOUNT_ETH");
  const value = parseEther(amountEth);

  const account = privateKeyToAccount(config.privateKey);
  const transport = http(config.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  // NOTE: recordPayment() is borrower-only — PRIVATE_KEY must be the borrower's key.
  const borrower = (await publicClient.readContract({
    address: config.contractAddress,
    abi: artifact.abi,
    functionName: "borrower",
  })) as `0x${string}`;
  if (account.address.toLowerCase() !== borrower.toLowerCase()) {
    throw new Error(
      `This wallet (${account.address}) is not the borrower (${borrower}) — recordPayment() will revert.`
    );
  }

  console.log(`Contract: ${config.contractAddress}`);
  console.log(`Paying:   ${amountEth} ETH from ${account.address}`);

  const hash = await walletClient.writeContract({
    address: config.contractAddress,
    abi: artifact.abi,
    functionName: "recordPayment",
    value,
  });

  console.log(`\nPayment tx: ${hash}`);
  console.log(`Explorer:   ${config.explorerUrl}/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("Payment transaction failed — inspect it at the explorer link above.");
  }

  const outstanding = (await publicClient.readContract({
    address: config.contractAddress,
    abi: artifact.abi,
    functionName: "outstandingPrincipal",
  })) as bigint;

  console.log(`\nPayment recorded. Outstanding principal: ${formatEther(outstanding)} ETH`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
