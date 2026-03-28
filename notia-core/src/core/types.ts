export type StructuralStatus = "pass" | "fail";
export type SemanticState = "valid" | "hold" | "reject";

export interface CanonicalEvent {
  event_id: string;
  domain: string;
  type: string;
  timestamp: string;
  subject_ref: string;
  related_refs?: string[];
  attributes?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface StructuralCheckResult {
  status: StructuralStatus;
  errors?: string[];
}

export interface MicrotoolResult {
  microtool: string;
  state: SemanticState;
  reason?: string;
}

export interface AggregatedResult {
  aggregated_state: SemanticState;
  domains: Record<string, { state: SemanticState; reason?: string }>;
}

export interface SemanticBundleMeaning {
  bundle_ref: string;
  aggregated_state: SemanticState;
  domains: Record<string, { state: SemanticState; reason?: string }>;
  derived_from: string[];
  event: unknown;
}

export interface SemanticBundle {
  existence: true;
  meaning: SemanticBundleMeaning;
  visibility_abstract: string;
  timestamp: string;
}