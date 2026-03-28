# 🚀 NOTIA

**Deterministic semantic compliance proofs for cross-border logistics on IOTA.**

## 📖 Overview

### The Use-Case

Cross-border logistics still depend on fragmented checks across identity, vehicle certification, cargo evidence, and compliance records. Operators often have access to the data, but not to a shared, portable interpretation of what that data means at the moment of inspection.

The target users are border operators, logistics companies, and compliance workflows that need a fast, auditable answer to a simple question: can this shipment move forward based on verifiable proofs, without exposing raw sensitive data?

### The Solution

NOTIA turns heterogeneous verifiable inputs into deterministic semantic bundles that can be evaluated consistently across systems. In our current BorderTest scenario, NOTIA verifies a driver proof with IOTA Identity, reads vehicle and cargo evidence from IOTA Move objects, converts those results into canonical events, computes a semantic compliance outcome, and anchors the resulting proof hash on IOTA.

The core value proposition is simple: portable compliance meaning, not just isolated data points.

## ✨ Key Features

* **Deterministic semantic engine:** Converts canonical events into portable semantic bundles with predictable `VALID`, `HOLD`, or `REJECT` outcomes.
* **Privacy-aware verification flow:** Reads verifiable public states and proofs instead of exposing raw commercial or personal data.
* **IOTA-anchored audit trail:** Produces an auditable compliance hash that can be notarized and linked to on-chain proof records.

## ⛓️ Use of IOTA Technology

NOTIA is built directly on IOTA infrastructure because the project needs verifiable identity, object-based asset state, and anchored auditability in one workflow.

* **IOTA Move Smart Contracts:** We deployed Move modules for `vehicle_certificate`, `cargo_manifest`, `border_compliance`, and `notia_anchor` to represent vehicle proofs, cargo evidence, compliance proof records, and bundle-hash anchoring.
* **IOTA Identity:** A Rust identity backend creates and verifies DIDs, VCs, and VPs for the driver identity flow used by the runtime.
* **IOTA Notarization:** The compliance result hash is submitted through a notarization adapter to create an immutable audit trail.
* **IOTA SDK:** The TypeScript runtime reads live Move objects from IOTA Testnet and resolves object state through the official SDK.
* **IOTA Names:** Human-readable IOTA names are resolved for better operator-facing presentation in the demo flow.

## 🏗 System Architecture

### High-Level Design

The operator runs a terminal-based demo/runtime. The runtime loads a scenario profile, verifies driver identity through the local Rust identity service, reads the vehicle certificate and cargo manifest from IOTA Testnet, and converts those proof results into canonical events.

Those canonical events are processed by `@notia/core`, which performs structural validation, deterministic routing, microtool interpretation, aggregation, and semantic bundle creation. `ncr-engine` then evaluates the resulting bundles against a scenario profile such as BorderTest and optionally anchors the final compliance hash back to IOTA.

### Technical Stack

* **Language:** TypeScript, Rust, Move
* **Frameworks:** Node.js CLI/TUI, Axum
* **IOTA SDKs:** `@iota/iota-sdk`, `@iota/notarization`, `@iota/iota-names-sdk`, `identity_iota`

## 🎬 Live Demo & Media

* **Live Demo Link:** [Add demo link]
* **Video Walkthrough:** [Add YouTube link, max 5 min]
* **Smart Contract Explorer:** [Add IOTA Explorer links for deployed `notia_anchor`, `border_compliance`, `vehicle_certificate`, and `cargo_manifest` contracts]

## 🛠 Setup & Installation

1. **Clone the repo:** `git clone https://github.com/[user]/[repo].git`
2. **Build the core package:**
   `cd notia-core && npm install && npm run build`
3. **Install the runtime:**
   `cd ../notia && npm install`
4. **Configure environment:** create `.env` in `notia` using `.env.example` and fill in your IOTA private key, RPC URL, package IDs, object IDs, and identity backend URL.
5. **Start the identity backend:**
   `cd ../iota-identity-backend && ./start.sh`
6. **Run the demo/runtime:**
   `cd ../notia && ./bin/notia`

## 👥 The Team

<@1420051612482801824>

## Notes For Final Submission

* Replace all placeholder links before submission.
* If the form prefers a product framing over a protocol framing, position NOTIA as a semantic compliance runtime for cross-border cargo.
* If the form allows extra detail, include screenshots from the terminal MVP and the explorer links for the deployed contracts.
