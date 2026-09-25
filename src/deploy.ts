import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
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
  bytecode: `0x${string}`;
}

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function address(name: string): `0x${string}` {
  const raw = env(name);
  const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
    throw new Error(`${name} must be a 20-byte hex address, got "${raw}".`);
  }
  return normalized as `0x${string}`;
}

/**
 * Standard amortization formula:
 *
 *   M = P * r(1+r)^n / ((1+r)^n - 1),   r = annualRateBps / 10000 / 12
 *
 * P = principal, n = term in months. Returns the monthly payment in ETH.
 * Computed with floating point — fine for loan setup, but always sanity-check
 * the wei value below before deploying. The contract trusts whatever payment
 * you pass it (garbage in, garbage out).
 */
function amortizationPayment(
  principalEth: number,
  annualRateBps: number,
  termMonths: number
): number {
  const r = annualRateBps / 10_000 / 12;
  if (r === 0) return principalEth / termMonths;
  const f = Math.pow(1 + r, termMonths);
  return (principalEth * r * f) / (f - 1);
}

async function main(): Promise<void> {
  if (!existsSync(ARTIFACT_PATH)) {
    throw new Error("Contract artifact not found — run `npx hardhat compile` first, then retry.");
  }
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as ContractArtifact;

  const borrower = address("BORROWER");
  const lender = address("LENDER");
  const principalEth = env("PRINCIPAL_ETH");
  const annualRateBps = BigInt(env("ANNUAL_RATE_BPS"));
  const termMonths = BigInt(env("TERM_MONTHS"));
  const graceDays = BigInt(env("GRACE_DAYS", "15"));

  let monthlyPaymentWei: bigint;
  if (process.env.MONTHLY_PAYMENT_ETH) {
    monthlyPaymentWei = parseEther(process.env.MONTHLY_PAYMENT_ETH);
    console.log(`Monthly payment (from env): ${process.env.MONTHLY_PAYMENT_ETH} ETH`);
  } else {
    const computed = amortizationPayment(
      Number(principalEth),
      Number(annualRateBps),
      Number(termMonths)
    );
    const computedStr = computed.toFixed(18).replace(/0+$/, "").replace(/\.$/, ".0");
    monthlyPaymentWei = parseEther(computedStr);
    console.log("Monthly payment computed via amortization:");
    console.log("  M = P * r(1+r)^n / ((1+r)^n - 1),  r = annualRateBps/10000/12");
    console.log(`  M = ${computedStr} ETH  (${monthlyPaymentWei.toString()} wei)`);
    console.log("  (override with MONTHLY_PAYMENT_ETH if your servicer quotes differently)");
  }

  const account = privateKeyToAccount(config.privateKey);
  const transport = http(config.rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  console.log(`\nNetwork:        ${chain.name} (chain id ${chain.id})`);
  console.log(`Deployer:       ${account.address}`);
  console.log(`Borrower:       ${borrower}`);
  console.log(`Lender:         ${lender}`);
  console.log(`Principal:      ${principalEth} ETH`);
  console.log(`Rate:           ${(Number(annualRateBps) / 100).toFixed(2)}% APR`);
  console.log(`Term:           ${termMonths.toString()} months`);
  console.log(`Grace period:   ${graceDays.toString()} days`);
  console.log(`Late fee:       5% of one monthly payment`);

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [
      borrower,
      lender,
      parseEther(principalEth),
      annualRateBps,
      termMonths,
      monthlyPaymentWei,
      graceDays,
    ],
  });

  console.log(`\nDeploy tx: ${hash}`);
  console.log(`Explorer:  ${config.explorerUrl}/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error("Deployment transaction failed — inspect it at the explorer link above.");
  }

  console.log(`\nContract deployed: ${receipt.contractAddress}`);
  console.log(`Explorer: ${config.explorerUrl}/address/${receipt.contractAddress}`);
  console.log(`\nAdd this to your .env:\nCONTRACT_ADDRESS=${receipt.contractAddress}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
