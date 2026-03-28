# NOTIA Core

`@notia/core` is the chain-agnostic semantic standard layer.

It defines canonical event structure, deterministic domain interpretation, semantic aggregation, bundle construction, and schema validation.

It is **not** a compliance engine and does not execute domain policies or operational workflows.

## Scope

- Canonical event and semantic bundle types
- Structural validation (`notia-canonical-event.schema.json`)
- Core semantic validation (`noema-core-pure.schema.json`)
- Deterministic routing/microtools/aggregation/bundling
- `runNotia(...)` semantic pipeline entrypoint

## Out of Scope

- IOTA adapters
- Compliance profiles and runtime policy evaluation
- Border/parking/business workflows

## Build

```bash
npm install
npm run build
```

## Public API

```ts
import { runNotia, structuralCheck, validateCoreBundle } from "@notia/core";
import type { CanonicalEvent, SemanticBundle } from "@notia/core";
```
