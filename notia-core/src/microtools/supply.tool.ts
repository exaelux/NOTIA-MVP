import type { CanonicalEvent, SemanticState } from "../core/types.js";

type SupplyResult = {
  microtool: "supply";
  state: SemanticState;
  reason?: string;
  details?: {
    missing_logs: string[];
  };
};

const REQUIRED_LOGS: readonly string[] = [
  "cold_chain_temperature_log",
  "geo_tracking_log",
  "weight_verification_scan",
  "humidity_sensor_data",
  "seal_integrity_check",
  "xray_scan_result",
];

function resolveRequiredLogs(event: CanonicalEvent): readonly string[] {
  const dynamicRequired = event.attributes?.required_logs;
  if (Array.isArray(dynamicRequired)) {
    const cleaned = dynamicRequired.filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    );
    if (cleaned.length > 0) {
      return cleaned;
    }
  }

  return REQUIRED_LOGS;
}

export function interpretSupply(event: CanonicalEvent): SupplyResult | null {
  if (event.domain !== "supply") {
    return null;
  }

  if (typeof event.type !== "string" || event.type.trim().length === 0) {
    return {
      microtool: "supply",
      state: "reject",
      reason: "missing_event_type",
    };
  }

  if (
    typeof event.subject_ref !== "string" ||
    event.subject_ref.trim().length === 0
  ) {
    return {
      microtool: "supply",
      state: "reject",
      reason: "missing_object_ref",
    };
  }

  const requiredLogs = resolveRequiredLogs(event);
  const logs = event.attributes?.logs;

  if (Array.isArray(logs)) {
    const logSet = new Set(
      logs.filter((entry): entry is string => typeof entry === "string"),
    );
    const hasAllRequiredLogs = requiredLogs.every((logId) => logSet.has(logId));

    if (hasAllRequiredLogs) {
      return { microtool: "supply", state: "valid" };
    }

    const missingLogs = requiredLogs.filter((logId) => !logSet.has(logId));
    return {
      microtool: "supply",
      state: "hold",
      reason: "missing_required_logs",
      details: { missing_logs: missingLogs },
    };
  }

  return {
    microtool: "supply",
    state: "hold",
    reason: "incomplete_supply_event",
  };
}
