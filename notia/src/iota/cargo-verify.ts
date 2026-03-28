import { IotaClient } from "@iota/iota-sdk/client";
import { requireIotaRpcUrl } from "./network.js";

// Noema principle: read declared states, not raw data.
// We never access shipper, consignee, value, or any commercial content.

export interface CargoManifestResult {
  valid: boolean;
  manifest_id: string;
  proof_logs: string[];
  required_logs: string[];
  reason?: string;
}

const FIELD_TO_LOG: Array<{ fields: string[]; log: string }> = [
  { fields: ["temperature_ok"], log: "cold_chain_temperature_log" },
  { fields: ["geo_tracking_ok", "geo_ok"], log: "geo_tracking_log" },
  { fields: ["weight_verified", "weight_ok"], log: "weight_verification_scan" },
  { fields: ["humidity_ok", "humidity_sensor_ok"], log: "humidity_sensor_data" },
  { fields: ["seal_intact"], log: "seal_integrity_check" },
  { fields: ["xray_cleared"], log: "xray_scan_result" },
];

function pickBooleanField(
  fields: Record<string, unknown>,
  candidates: string[],
): { exists: boolean; value: boolean } {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      return { exists: true, value: fields[key] === true };
    }
  }
  return { exists: false, value: false };
}

export async function verifyCargoManifestOnChain(
  objectId: string
): Promise<CargoManifestResult> {
  const rpcUrl = requireIotaRpcUrl();
  const client = new IotaClient({ url: rpcUrl });

  const obj = await client.getObject({
    id: objectId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    return {
      valid: false,
      manifest_id: "",
      proof_logs: [],
      required_logs: [],
      reason: "object_not_found",
    };
  }

  const fields = (obj.data.content as { fields?: Record<string, unknown> }).fields ?? {};

  // Read only verifiable states — never content
  const active = fields["active"] as boolean;
  const temperature_ok = fields["temperature_ok"] as boolean;
  const seal_intact = fields["seal_intact"] as boolean;
  const xray_cleared = fields["xray_cleared"] as boolean;
  const hazmat = fields["hazmat"] as boolean;
  const manifest_id = fields["manifest_id"] as string;

  const required_logs: string[] = [];
  const proof_logs: string[] = [];

  for (const mapping of FIELD_TO_LOG) {
    const resolved = pickBooleanField(fields, mapping.fields);
    if (!resolved.exists) {
      continue;
    }
    required_logs.push(mapping.log);
    if (resolved.value) {
      proof_logs.push(mapping.log);
    }
  }

  if (!active) {
    return { valid: false, manifest_id, proof_logs, required_logs, reason: "manifest_revoked" };
  }
  if (!temperature_ok) {
    return { valid: false, manifest_id, proof_logs, required_logs, reason: "cold_chain_failed" };
  }
  if (!seal_intact) {
    return { valid: false, manifest_id, proof_logs, required_logs, reason: "seal_broken" };
  }
  if (!xray_cleared) {
    return { valid: false, manifest_id, proof_logs, required_logs, reason: "xray_failed" };
  }
  if (hazmat) {
    return { valid: false, manifest_id, proof_logs, required_logs, reason: "hazmat_detected" };
  }

  return { valid: true, manifest_id, proof_logs, required_logs };
}
