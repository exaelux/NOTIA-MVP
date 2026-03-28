import type { CanonicalContext } from "./compose.js";

export interface CanonicalComplianceResult {
  result: "valid" | "hold" | "reject";
  evaluated_domains: Record<string, "valid" | "hold" | "reject">;
  bundle_refs: string[];
}

export function evaluateCanonicalCompliance(
  ctx: CanonicalContext
): CanonicalComplianceResult {
  let result: "valid" | "hold" | "reject" = "valid";

  for (const state of Object.values(ctx.domain_states)) {
    if (state === "reject") {
      result = "reject";
      break;
    }
    if (state === "hold" && result === "valid") {
      result = "hold";
    }
  }

  return {
    result,
    evaluated_domains: { ...ctx.domain_states },
    bundle_refs: ctx.bundle_refs,
  };
}
