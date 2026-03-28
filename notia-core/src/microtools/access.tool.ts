import type { CanonicalEvent, SemanticState } from "../core/types.js";

type AccessResult = {
  microtool: "access";
  state: SemanticState;
  reason?: string;
};

export function interpretAccess(event: CanonicalEvent): AccessResult | null {
  if (event.domain !== "access") {
    return null;
  }

  if (typeof event.type !== "string" || event.type.trim().length === 0) {
    return {
      microtool: "access",
      state: "reject",
      reason: "missing_event_type",
    };
  }

  const action = event.attributes?.action;

  if (action === "enter" || action === "exit") {
    return {
      microtool: "access",
      state: "valid",
    };
  }

  return {
    microtool: "access",
    state: "hold",
    reason: "unsupported_action",
  };
}