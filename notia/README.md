# NCR — Notia Compliance Runtime

NCR is a compliance runtime that consumes the @notia/core semantic standard.

## Architecture
- notia-core: chain-agnostic semantic standard (CanonicalEvent, SemanticBundle)
- ncr-engine: compliance runtime (BorderTest profile, IOTA adapters)

## Services used
- IOTA Identity: DID + VC + VP verification
- IOTA Notarization: proof hash anchor
- IOTA Move (x4 contracts): anchor, compliance, vehicle_certificate, cargo_manifest
- IOTA Names: joebloggs.iota human-readable identity

## Running the demo
1. Canonical runtime (default): `ncr`
2. BorderTest scenario runtime: `ncr fronter` (alias: `ncr frontier`)
3. BorderTest stable mode: `ncr fronter demo`
4. BorderTest watch mode: `ncr fronter watch`
5. Negative case: `npm run demo:tui:fail`

The runtime is online-first: configure `IOTA_RPC_URL`, package IDs, object IDs, and `IDENTITY_SERVICE_URL` to ingest live on-chain data. File events remain available only as a demo fallback.

## Scenario profiles
- Profiles are JSON files in `profiles/*.json`
- Default profile: `profiles/bordertest.json`
- Default input mode is on-chain (`eventSource: "onchain"` / `NCR_EVENT_SOURCE=onchain`)
- Run with profile id:
  - `ncr --profile bordertest`
- Run with profile file path:
  - `ncr --profile ./profiles/your-scenario.json`
- You can also set `NCR_PROFILE=bordertest` in the environment
- Optional demo fallback: `NCR_EVENT_SOURCE=file` (reads `eventsPath`)

## Move contracts (testnet)
- notia_anchor: 0xf3153d...
- border_compliance: 0x48ba85...
- vehicle_certificate: 0xd6e889...
- cargo_manifest: 0xd1ffed...

## Environment
Copy `.env.example` and fill in your RPC endpoint, package IDs, object IDs, signing key, and identity verifier endpoint.

## Canonical Input Source
- `ncr` (canonical) reads the same scenario profile stack as `ncr fronter`:
  - `NCR_PROFILE` / `--profile`
  - `profiles/*.json`
  - env overrides for object IDs
- This keeps on-chain object selection and name URLs aligned between canonical and border runtimes.
