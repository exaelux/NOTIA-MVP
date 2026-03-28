import { IotaClient } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction } from "@iota/iota-sdk/transactions";
import type {
  ComplianceAnchorAdapter,
  ComplianceAnchorInput,
  AnchorResult,
} from "./types.js";
import { networkLabel, requireIotaRpcUrl } from "./network.js";

function strToBytes(str: string): number[] {
  return Array.from(new TextEncoder().encode(str));
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

export class IotaComplianceAnchorAdapter implements ComplianceAnchorAdapter {
  private client: IotaClient;
  private keypair: Ed25519Keypair;
  private packageId: string;

  constructor() {
    const rpcUrl = requireIotaRpcUrl();
    const privateKey = process.env.IOTA_PRIVATE_KEY?.trim() ?? "";
    const packageId = process.env.BORDER_COMPLIANCE_PACKAGE_ID?.trim() ?? "";

    if (!privateKey) {
      throw new Error("Missing IOTA_PRIVATE_KEY. Compliance anchoring requires a signing key.");
    }
    if (!packageId) {
      throw new Error(
        "Missing BORDER_COMPLIANCE_PACKAGE_ID. Set the deployed border_compliance package id.",
      );
    }

    this.client = new IotaClient({ url: rpcUrl });
    this.keypair = Ed25519Keypair.fromSecretKey(privateKey);
    this.packageId = packageId;
  }

  async submitProof(input: ComplianceAnchorInput): Promise<AnchorResult> {
    const anchored_at = new Date().toISOString();

    const tx = new Transaction();
    tx.moveCall({
      target: `${this.packageId}::border_compliance::submit_proof`,
      arguments: [
        tx.pure.vector("u8", strToBytes(input.subject_ref)),
        tx.pure.vector("u8", strToBytes(input.profile_id)),
        tx.pure.bool(input.result),
        tx.pure.vector("u8", hexToBytes(input.bundle_hash)),
      ],
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
