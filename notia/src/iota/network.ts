type ExplorerNetwork = "mainnet" | "testnet" | "devnet";

function parseNetwork(value: string | undefined): ExplorerNetwork | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "mainnet" || normalized === "testnet" || normalized === "devnet") {
    return normalized;
  }
  return null;
}

export function detectIotaNetwork(): ExplorerNetwork {
  const explicitNetwork = parseNetwork(process.env.IOTA_NETWORK);
  if (explicitNetwork) {
    return explicitNetwork;
  }

  const rpc = process.env.IOTA_RPC_URL?.toLowerCase() ?? "";
  if (rpc.includes("mainnet")) {
    return "mainnet";
  }
  if (rpc.includes("devnet")) {
    return "devnet";
  }
  if (rpc.includes("testnet")) {
    return "testnet";
  }

  return "testnet";
}

export function requireIotaRpcUrl(): string {
  const rpcUrl = process.env.IOTA_RPC_URL?.trim();
  if (!rpcUrl) {
    throw new Error(
      "Missing IOTA_RPC_URL. Set it to the RPC endpoint for the network you want to ingest from.",
    );
  }
  return rpcUrl;
}

export function resolveIotaGraphqlUrl(): string {
  const explicitGraphql = process.env.IOTA_GRAPHQL_URL?.trim();
  if (explicitGraphql) {
    return explicitGraphql;
  }

  const rpcUrl = requireIotaRpcUrl();
  if (rpcUrl.includes("api.")) {
    return rpcUrl.replace("api.", "graphql.");
  }

  throw new Error(
    "Missing IOTA_GRAPHQL_URL. Set it explicitly when it cannot be inferred from IOTA_RPC_URL.",
  );
}

export function networkLabel(): string {
  return `IOTA-${detectIotaNetwork().toUpperCase()}`;
}

