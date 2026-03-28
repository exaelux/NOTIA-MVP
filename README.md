# NOTIA

Deterministic semantic compliance proofs for cross-border logistics on IOTA.

## Overview

NOTIA is a hackathon-ready workspace that packages the current MVP as a standalone project.

The system verifies identity, asset state, and evidence integrity, computes a semantic compliance decision, and anchors the resulting proof flow to IOTA infrastructure. The current submission is built and validated for IOTA Testnet.

## What This Repo Contains

- `notia/`: main runtime, demo CLI, IOTA adapters, and terminal UX
- `notia-core/`: chain-agnostic semantic core used by the runtime
- `iota-identity-backend/`: local identity verifier used by the runtime for DID / VC / VP checks

## Demo Flow

1. Load the NOTIA runtime
2. Verify subject identity
3. Verify on-chain asset and evidence objects
4. Evaluate semantic compliance
5. Produce a final runtime state
6. Anchor the proof trail to IOTA when applicable

## Quick Start

1. Build the semantic core:
   `cd notia-core && npm install && npm run build`
2. Build the runtime:
   `cd ../notia && npm install && npm run build`
3. Start the identity backend:
   `cd ../iota-identity-backend && ./start.sh`
4. Run NOTIA:
   `cd ../notia && ./bin/notia`

## Stack

- TypeScript runtime and CLI
- Local Rust identity verifier
- IOTA SDKs and IOTA Names
- IOTA Move contracts for compliance-related objects

## Notes

- The demo is online-first and intended to ingest live on-chain data.
- Example input files remain in the repo only as demo fixtures and fallback material.
- Environment configuration for the runtime lives in `notia/.env` and `notia/.env.example`.
