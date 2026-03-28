import type { BorderContext } from "./compose.js";

export interface ComplianceResult {
  result: "valid" | "hold" | "reject";
  evaluated_domains: Record<string, string>;
  bundle_refs: string[];
}

export function evaluateBorderCompliance(
  ctx: BorderContext
): ComplianceResult {
  const d = ctx.domain_states;

  let result: "valid" | "hold" | "reject" = "valid";

  if (
    d["identity"] === "reject" ||
    d["token"] === "reject" ||
    d["supply"] === "reject" ||
    d["supply"] === "hold"
  ) {
    result = "reject";
  } else if (d["identity"] === "hold") {
    result = "hold";
  }

  return {
    result,
    evaluated_domains: { ...d },
    bundle_refs: ctx.bundle_refs,
  };
}
