import { runNotia } from "@notia/core";
import type { CanonicalEvent, SemanticBundle } from "@notia/core";
import { composeBundles } from "./compose.js";
import { evaluateCanonicalCompliance } from "./evaluate.js";
import type { CanonicalComplianceResult } from "./evaluate.js";

export interface CanonicalRunResult {
  bundles: SemanticBundle[];
  compliance: CanonicalComplianceResult;
}

export function runCanonical(events: CanonicalEvent[]): CanonicalRunResult {
  const bundles: SemanticBundle[] = [];

  for (const event of events) {
    const result = runNotia(event);

    if (result.type === "semantic_bundle") {
      const bundle = result.bundle as unknown as SemanticBundle;
      bundles.push(bundle);
    }
  }

  const ctx = composeBundles(bundles);
  const compliance = evaluateCanonicalCompliance(ctx);

  return {
    bundles,
    compliance,
  };
}
