# Contributing

Thanks for your interest in improving the Ethereum NFT Deployer.

## Workflow

1. Fork the repo and create a branch from `main`.
2. Test every change against **Sepolia** before opening a PR.
3. Keep scripts idempotent where possible — a failed deploy should be safely re-runnable.
4. Update the README if you change CLI behavior or env variables.

## Standards

- TypeScript, strict mode, no `any` without justification.
- Solidity 0.8.24, OpenZeppelin Contracts v5.
- No secrets in code, logs, or committed files. Ever.
- One concern per script: `config.ts`, `deploy.ts`, `mint.ts` stay focused.

## Security

If you find a vulnerability (especially around key handling), please open an issue rather than a PR so it can be handled carefully.
