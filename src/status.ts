import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, formatEther, http, type Abi } from "viem";
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

async function read(
  publicClient: ReturnType<typeof createPublicClient>,
  artifact: ContractArtifact,
  functionName: string
): Promise<bigint | `0x${string}` | boolean> {
  return (await publicClient.readContract({
    address: config.contractAddress as `0x${string}`,
    abi: artifact.abi,
    functionName,
  })) as bigint | `0x${string}` | boolean;
}

function date(ts: bigint): string {
  return new Date(Number(ts) * 1000).toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  if (!existsSync(ARTIFACT_PATH)) {
    throw new Error("Contract artifact not found — run `npx hardhat compile` first, then retry.");
  }
  if (!config.contractAddress) {
    throw new Error("CONTRACT_ADDRESS is not set — deploy first (`npm run deploy`).");
  }
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as ContractArtifact;
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

  const borrower = (await read(publicClient, artifact, "borrower")) as `0x${string}`;
  const lender = (await read(publicClient, artifact, "lender")) as `0x${string}`;
  const principal = (await read(publicClient, artifact, "principal")) as bigint;
  const annualRateBps = (await read(publicClient, artifact, "annualRateBps")) as bigint;
  const termMonths = (await read(publicClient, artifact, "termMonths")) as bigint;
  const monthlyPayment = (await read(publicClient, artifact, "monthlyPayment")) as bigint;
  const outstanding = (await read(publicClient, artifact, "outstandingPrincipal")) as bigint;
  const totalPaid = (await read(publicClient, artifact, "totalPaid")) as bigint;
  const totalInterest = (await read(publicClient, artifact, "totalInterestPaid")) as bigint;
  const totalLateFees = (await read(publicClient, artifact, "totalLateFeesPaid")) as bigint;
  const unpaidLateFees = (await read(publicClient, artifact, "unpaidLateFees")) as bigint;
  const pending = (await read(publicClient, artifact, "pendingInterest")) as bigint;
  const paymentsMade = (await read(publicClient, artifact, "paymentsMade")) as bigint;
  const nextDue = (await read(publicClient, artifact, "nextDueDate")) as bigint;
  const start = (await read(publicClient, artifact, "startTimestamp")) as bigint;
  const delinquent = (await read(publicClient, artifact, "isDelinquent")) as boolean;
  const paidOff = (await read(publicClient, artifact, "paidOff")) as boolean;

  console.log(`MortgageTracker @ ${config.contractAddress}`);
  console.log(`Explorer: ${config.explorerUrl}/address/${config.contractAddress}\n`);
  console.log(`Borrower:            ${borrower}`);
  console.log(`Lender:              ${lender}`);
  console.log(`Origination:         ${date(start)}`);
  console.log(`Original principal:  ${formatEther(principal)} ETH`);
  console.log(`Rate:                ${(Number(annualRateBps) / 100).toFixed(2)}% APR`);
  console.log(`Term:                ${termMonths.toString()} months`);
  console.log(`Monthly payment:     ${formatEther(monthlyPayment)} ETH\n`);
  console.log(`Outstanding:         ${formatEther(outstanding)} ETH`);
  console.log(`Total paid:          ${formatEther(totalPaid)} ETH`);
  console.log(`  of which interest: ${formatEther(totalInterest)} ETH`);
  console.log(`  of which late fees:${formatEther(totalLateFees)} ETH`);
  console.log(`Pending interest:    ${formatEther(pending)} ETH`);
  console.log(`Unpaid late fees:    ${formatEther(unpaidLateFees)} ETH`);
  console.log(`Payments made:       ${paymentsMade.toString()}`);
  console.log(`Next due:            ${date(nextDue)}`);
  console.log(`Delinquent:          ${delinquent ? "YES" : "no"}`);
  console.log(`Paid off:            ${paidOff ? "YES" : "no"}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
