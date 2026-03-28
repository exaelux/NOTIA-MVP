import type { CanonicalEvent, SemanticState } from "../core/types.js";

type IdentityResult = {
  microtool: "identity";
  state: SemanticState;
  reason?: string;
};

export function interpretIdentity(event: CanonicalEvent): IdentityResult | null {
  if (event.domain !== "identity") {
    return null;
  }

  if (typeof event.type !== "string" || event.type.trim().length === 0) {
    return {
      microtool: "identity",
      state: "reject",
      reason: "missing_event_type",
    };
  }

  if (
    typeof event.subject_ref !== "string" ||
    event.subject_ref.trim().length === 0
  ) {
    return {
      microtool: "identity",
      state: "reject",
      reason: "missing_subject_ref",
    };
  }

  const identity_status = event.attributes?.identity_status;

  if (identity_status === "verified") {
    return { microtool: "identity", state: "valid" };
  }

  if (identity_status === "pending") {
    return { microtool: "identity", state: "hold" };
  }

  if (identity_status === "revoked") {
    return { microtool: "identity", state: "reject" };
  }

  return {
    microtool: "identity",
    state: "hold",
    reason: "unknown_identity_status",
  };
}