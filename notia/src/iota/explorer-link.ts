import { detectIotaNetwork } from "./network.js";

export type ExplorerRefKind = "auto" | "object" | "tx" | "address" | "did" | "url";

function detectExplorerNetwork(): string {
  const explicit = process.env.IOTA_EXPLORER_NETWORK?.trim();
  if (explicit) {
    return explicit;
  }

  return detectIotaNetwork();
}

function withNetwork(url: URL): string {
  const network = detectExplorerNetwork();
  url.searchParams.set("network", network);
  return url.toString();
}

function explorerBaseUrl(): string {
  return process.env.IOTA_EXPLORER_BASE_URL?.trim() || "https://explorer.iota.org";
}

export function extractAddressFromDid(did: string): string {
  const parts = did.split(":");
  return parts.length > 0 ? parts[parts.length - 1] ?? did : did;
}

function looksLikeObjectId(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function looksLikeAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function looksLikeTxDigest(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{40,64}$/.test(value);
}

function buildObjectUrl(objectId: string): string {
  const url = new URL(`/object/${objectId}`, explorerBaseUrl());
  return withNetwork(url);
}

function buildTxUrl(txDigest: string): string {
  const url = new URL(`/txblock/${txDigest}`, explorerBaseUrl());
  return withNetwork(url);
}

function buildAddressUrl(address: string): string {
  const url = new URL(`/address/${address}`, explorerBaseUrl());
  return withNetwork(url);
}

export function buildIotaExplorerUrl(ref: string, kind: ExplorerRefKind = "auto"): string | null {
  const value = ref.trim();
  if (!value) {
    return null;
  }

  if (kind === "url") {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (kind === "did") {
    return buildAddressUrl(extractAddressFromDid(value));
  }
  if (kind === "address") {
    return buildAddressUrl(value);
  }
  if (kind === "object") {
    return buildObjectUrl(value);
  }
  if (kind === "tx") {
    return buildTxUrl(value);
  }

  if (value.startsWith("did:iota:")) {
    return buildAddressUrl(extractAddressFromDid(value));
  }
  if (looksLikeObjectId(value)) {
    return buildObjectUrl(value);
  }
  if (looksLikeAddress(value)) {
    return buildAddressUrl(value);
  }
  if (looksLikeTxDigest(value)) {
    return buildTxUrl(value);
  }

  return null;
}
