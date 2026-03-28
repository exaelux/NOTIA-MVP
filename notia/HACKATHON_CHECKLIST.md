# NOTIA Hackathon Checklist

## Product

- `notia` opens the intended final runtime.
- The header shown in the demo matches the product name and story you want to present.
- The primary flow uses live on-chain data, not mock data.
- Fallback/example scenario data is clearly framed as demo input only.

## Environment

- `.env` contains the correct `IOTA_RPC_URL`.
- `.env` contains `IOTA_GRAPHQL_URL`.
- `.env` contains `IDENTITY_SERVICE_URL`.
- `.env` contains `IOTA_PRIVATE_KEY`.
- `.env` contains `NOTIA_ANCHOR_PACKAGE_ID`.
- `.env` contains `BORDER_COMPLIANCE_PACKAGE_ID`.
- `.env` contains the current vehicle and cargo object ids.
- The machine running the demo has network access to IOTA and the identity backend.

## Demo Readiness

- `source ~/.bashrc` works and `notia` resolves in the shell.
- `notia` starts without manual path fixing.
- Identity verification succeeds.
- Vehicle verification succeeds.
- Cargo verification succeeds.
- Explorer links are visible and clickable in the terminal output.
- The demo does not get stuck in an uncontrolled loop.
- On resolution/detection failure, the runtime returns to header and waits for `ENTER`.

## Operational Checks

- `npm run build` passes in `ncr-engine`.
- The identity backend can be started successfully.
- The final demo machine has the same `.env` values as the tested machine.
- The exact object ids used in the demo still exist on IOTA Testnet.
- Explorer links for tx, object, and address open correctly.

## Submission Assets

- Repository URL is ready.
- Video walkthrough URL is ready.
- Smart contract explorer URLs are ready.
- One-sentence tagline is finalized.
- One-paragraph overview is finalized.
- Three key features are finalized.
- IOTA integration section is finalized.

## Live Pitch

- Opening sentence explains the problem in one line.
- Second sentence explains what NOTIA does in one line.
- The phrase `live on-chain verification on IOTA Testnet` is used clearly.
- You explicitly say this is an MVP with production-hardening still ahead.
- You know what to say if asked why identity uses a backend service.

## Backup Plan

- A tested fallback scenario exists.
- The team knows the one command to start the demo.
- A terminal window is already positioned in the project root.
- Explorer pages are ready to open quickly if terminal links fail.
