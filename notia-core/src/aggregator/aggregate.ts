type MicrotoolState = "valid" | "hold" | "reject";

type MicrotoolAggregateInput = {
  microtool: string;
  state: MicrotoolState;
  reason?: string;
};

type AggregatedOutput = {
  aggregated_state: MicrotoolState;
  domains: Record<string, { state: MicrotoolState; reason?: string }>;
};

export function aggregate(results: MicrotoolAggregateInput[]): AggregatedOutput {
  const domains: Record<string, { state: MicrotoolState; reason?: string }> = {};
  let hasHold = false;
  let hasReject = false;

  for (const result of results) {
    domains[result.microtool] = {
      state: result.state,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
    };

    if (result.state === "reject") {
      hasReject = true;
    } else if (result.state === "hold") {
      hasHold = true;
    }
  }

  const aggregated_state: MicrotoolState = hasReject
    ? "reject"
    : hasHold
      ? "hold"
      : "valid";

  return {
    aggregated_state,
    domains,
  };
}
