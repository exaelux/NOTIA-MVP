import { IotaClient } from "@iota/iota-sdk/client";
import { requireIotaRpcUrl } from "./network.js";

// Noema principle: read declared states, not raw data.
// plate is a public identifier. owner_did is never accessed.

export interface VehicleCertResult {
  valid: boolean;
  plate: string;
  vehicle_class: string;
  reason?: string;
}

export async function verifyVehicleCertOnChain(
  objectId: string
): Promise<VehicleCertResult> {
  const rpcUrl = requireIotaRpcUrl();
  const client = new IotaClient({ url: rpcUrl });

  const obj = await client.getObject({
    id: objectId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    return { valid: false, plate: "", vehicle_class: "", reason: "object_not_found" };
  }

  const fields = (obj.data.content as { fields?: Record<string, unknown> }).fields ?? {};

  // Read only verifiable states and public identifiers
  const active        = fields["active"] as boolean;
  const plate         = fields["plate"] as string;
  const vehicle_class = fields["vehicle_class"] as string;

  if (!active) return { valid: false, plate, vehicle_class, reason: "certificate_revoked" };

  return { valid: true, plate, vehicle_class };
}
