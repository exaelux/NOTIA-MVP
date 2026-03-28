import type { SemanticBundle } from "@notia/core";

export interface BorderContext {
  bundle_refs: string[];
  domain_states: Record<string, "valid" | "hold" | "reject">;
  bundles: SemanticBundle[];
}

export function composeBundles(bundles: SemanticBundle[]): BorderContext {
  const domain_states: Record<string, "valid" | "hold" | "reject"> = {};
  const bundle_refs: string[] = [];

  for (const bundle of bundles) {
    const event = bundle.meaning.event as { domain?: string };
    const domain = event.domain ?? "unknown";
    const state = bundle.meaning.aggregated_state;
    domain_states[domain] = state;
    bundle_refs.push(bundle.meaning.bundle_ref);
  }

  return {
    bundle_refs,
    domain_states,
    bundles,
  };
}
