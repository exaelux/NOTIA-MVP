import type {
  CanonicalEvent,
  SemanticBundle,
  SemanticState,
} from "@notia/core";
import { runNotia } from "@notia/core";
import { composeBundles } from "./compose.js";
import { evaluateBorderCompliance } from "./evaluate.js";
import type { ComplianceResult } from "./evaluate.js";

export interface BorderTestResult {
  bundles: SemanticBundle[];
  compliance: ComplianceResult;
}

export function runBorderTest(events: CanonicalEvent[]): BorderTestResult {
  const bundles: SemanticBundle[] = [];

  for (const event of events) {
    const result = runNotia(event);

    if (result.type === "semantic_bundle") {
      const bundle = result.bundle as unknown as SemanticBundle;
      bundles.push(bundle);
    }
  }

  const ctx = composeBundles(bundles);
  const compliance = evaluateBorderCompliance(ctx);

  return {
    bundles,
    compliance,
  };
}
