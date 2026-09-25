# Mortgage Tracker

![banner](assets/banner.jpg)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Ethereum](https://img.shields.io/badge/Ethereum-Mainnet-627EEA.svg)](https://etherscan.io)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636.svg)](https://soliditylang.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org)

An on-chain mortgage ledger for Ethereum. The loan's source of truth lives in
the contract: outstanding balance, interest accrual, late fees, payment history,
and delinquency status are all verifiable by anyone, any time. Built on
[Hardhat](https://hardhat.org), [OpenZeppelin Contracts](https://openzeppelin.com/contracts),
and [viem](https://viem.sh).

## What it is

`MortgageTracker.sol` records an amortizing loan on-chain:

- **Borrower-only payments** — `recordPayment()` is payable and restricted to
  the borrower; funds are forwarded straight to the lender.
- **Interest accrual** — on every payment, interest accrues for each full
  month elapsed since the last accrual:
  `outstandingPrincipal × annualRateBps / 10000 / 12` per month.
- **Payment waterfall** — each payment applies to unpaid late fees first, then
  accrued interest, then principal. Overpayments are refunded.
- **Late fees** — paying after `nextDueDate + gracePeriod` assesses a 5% fee
  (one monthly payment × 500 bps), tracked separately on-chain.
- **Delinquency** — `isDelinquent()` is true while the loan is live and past
  the due date plus grace period.
- **Payoff** — when the outstanding principal hits zero, `paidOff` locks to
  true, `LoanPaidOff()` is emitted, and further payments are rejected.

## Quickstart

```bash
npm install
npx hardhat compile
npm run build

cp .env.example .env   # fill in RPC_URL, PRIVATE_KEY, loan terms
npm run deploy         # set CONTRACT_ADDRESS in .env afterwards

npm run status         # full loan snapshot
AMOUNT_ETH=0.6321 npm run pay   # make a payment (borrower's key)
```

The deploy script computes the monthly payment from the standard amortization
formula when `MONTHLY_PAYMENT_ETH` is left empty:

```
M = P × r(1+r)^n / ((1+r)^n − 1),   r = annualRateBps / 10000 / 12
```

## How interest accrual works

The contract does not accrue interest every block — it accrues lazily, once per
payment, for each full 30-day month elapsed since the previous accrual. Reading
`pendingInterest()` or `npm run status` shows the live accrued amount without
writing to the chain. A month is approximated as 30 days, which is the standard
simplification for template-grade amortization schedules.

## Security notes

- **Payment amounts are trusted from off-chain amortization — garbage in,
  garbage out.** The contract never validates that `monthlyPayment` matches the
  principal, rate, and term. Verify the deploy script's computed value against
  your servicer's schedule before deploying.
- Only the borrower can call `recordPayment()`; guard that key like the loan
  depends on it, because it does.
- Late-fee rate (5%) and the 30-day month are fixed at deployment by design —
  changing loan economics mid-term would need a new contract.
- This template has not been audited. Do not use it with real funds until it
  has been reviewed by qualified professionals.

## Scripts

| Script | Command | Purpose |
|---|---|---|
| `src/deploy.ts` | `npm run deploy` | Deploy with loan terms from `.env` |
| `src/make-payment.ts` | `AMOUNT_ETH=… npm run pay` | Record a borrower payment |
| `src/status.ts` | `npm run status` | Read-only loan snapshot |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
