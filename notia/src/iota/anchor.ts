import { createHash } from "node:crypto";
import { IotaClient } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction } from "@iota/iota-sdk/transactions";
import type { AnchorAdapter, AnchorResult } from "./types.js";
import { networkLabel, requireIotaRpcUrl } from "./network.js";

function getBundleRef(bundle: unknown): string {
  if (bundle === null || typeof bundle !== "object") return "";
  const meaning = (bundle as { meaning?: unknown }).meaning;
  if (meaning === null || typeof meaning !== "object") return "";
  const bundleRef = (meaning as { bundle_ref?: unknown }).bundle_ref;
  return typeof bundleRef === "string" ? bundleRef : "";
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

export class IotaAnchorAdapter implements AnchorAdapter {
  private client: IotaClient;
  private keypair: Ed25519Keypair;
  private packageId: string;

  constructor() {
    const rpcUrl = requireIotaRpcUrl();
    const privateKey = process.env.IOTA_PRIVATE_KEY?.trim() ?? "";
    const packageId = process.env.NOTIA_ANCHOR_PACKAGE_ID?.trim() ?? "";

    if (!privateKey) {
      throw new Error("Missing IOTA_PRIVATE_KEY. On-chain anchoring requires a signing key.");
    }
    if (!packageId) {
      throw new Error("Missing NOTIA_ANCHOR_PACKAGE_ID. Set the deployed notia_anchor package id.");
    }

    this.client = new IotaClient({ url: rpcUrl });
    this.keypair = Ed25519Keypair.fromSecretKey(privateKey);
    this.packageId = packageId;
  }

  async anchor(bundle: unknown): Promise<AnchorResult> {
    const anchored_at = new Date().toISOString();
    const bundleRef = getBundleRef(bundle);
    const bundleHashBytes = hexToBytes(bundleRef);

    const tx = new Transaction();
    tx.moveCall({
      target: `${this.packageId}::notia_anchor::anchor`,
      arguments: [tx.pure.vector("u8", bundleHashBytes)],
    });

    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.keypair,
      options: { showEffects: true },
    });

    return {
      network: networkLabel(),
      transaction_id: result.digest,
      anchored_at,
      status: result.effects?.status?.status ?? "unknown",
    };
  }
}
