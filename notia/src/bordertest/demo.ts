import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import type { CanonicalEvent } from "@notia/core";
import { runBorderTest } from "./runBorderTest.js";
import { IotaNotarizationAdapter } from "../iota/notarization-anchor.js";
import { createHash } from "node:crypto";
import { verifyDriverVP } from "../iota/identity-verify.js";
import { verifyVehicleCertOnChain } from "../iota/vehicle-verify.js";
import { verifyCargoManifestOnChain } from "../iota/cargo-verify.js";
import { buildIotaExplorerUrl } from "../iota/explorer-link.js";

config({ quiet: true });

async function main(): Promise<void> {
  console.log("===========================================");
  console.log("  NCR MVP — BorderTest Demo");
  console.log("  Notia Compliance Runtime");
  console.log("===========================================\n");

  // Load events
  const raw = await readFile("events/bordertest.json", "utf8");
  const events = JSON.parse(raw) as CanonicalEvent[];

  console.log(`Loading ${events.length} events...\n`);
  
  // Verify driver identity first
  const identity = await verifyDriverVP();
  if (!identity.verified) {
    console.log("❌ Driver identity verification FAILED. Cannot proceed.");
    process.exitCode = 1;
    return;
  }
  console.log(`✅ Driver verified: ${identity.driverDid}\n`);
  // Verify vehicle certificate on-chain
  const vehicleObjectId = process.env.VEHICLE_CERTIFICATE_OBJECT_ID ?? "";
  const vehicle = await verifyVehicleCertOnChain(vehicleObjectId);
  if (!vehicle.valid) {
    console.log(`❌ Vehicle certificate invalid: ${vehicle.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✅ Vehicle verified on-chain: ${vehicle.plate} (${vehicle.vehicle_class})\n`);
  // Verify cargo manifest on-chain
  const cargoObjectId = process.env.CARGO_MANIFEST_OBJECT_ID ?? "";
  const cargo = await verifyCargoManifestOnChain(cargoObjectId);
  if (!cargo.valid) {
    console.log(`❌ Cargo manifest invalid: ${cargo.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✅ Cargo verified on-chain: ${cargo.manifest_id} (${cargo.manifest_id})\n`);
  // Run BorderTest
  const { bundles, compliance } = runBorderTest(events);

  // Print bundle results
  console.log("--- Semantic Bundles ---");
  for (const bundle of bundles) {
    const domain = (bundle.meaning.event as { domain?: string }).domain ?? "unknown";
    console.log(
      `[${domain.toUpperCase()}] ${bundle.meaning.aggregated_state.toUpperCase()} | ref: ${bundle.meaning.bundle_ref.slice(0, 16)}...`
    );
  }

  // Print compliance result
  console.log("\n--- Compliance Evaluation ---");
  console.log(`Profile:  bordertest-v1`);
  console.log(`Subject:  vehicle:plate:TRUCK-BorderTest`);
  console.log(`Result:   ${compliance.result.toUpperCase()}`);
  console.log(`Domains:  ${JSON.stringify(compliance.evaluated_domains)}`);
  console.log(`Bundles:  ${compliance.bundle_refs.length} evaluated`);

  if (compliance.result !== "valid") {
    console.log("\n❌ Compliance FAILED. Truck cannot cross.");
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ Compliance PASSED. Anchoring proof on IOTA...\n");

  // Build compliance bundle hash
  const complianceHash = createHash("sha256")
    .update(JSON.stringify({
      bundle_refs: compliance.bundle_refs,
      result: compliance.result,
      profile_id: "bordertest-v1",
    }))
    .digest("hex");

  // Anchor on IOTA L1
  const adapter = new IotaNotarizationAdapter();

  try {
    const anchor = await adapter.submitProof({
      subject_ref: "vehicle:plate:TRUCK-BorderTest",
      profile_id: "bordertest-v1",
      result: true,
      bundle_hash: complianceHash,
    });

    console.log("--- IOTA Anchor ---");
    console.log(`Network:  ${anchor.network}`);
    console.log(`TX ID:    ${anchor.transaction_id}`);
    console.log(`Status:   ${anchor.status}`);
    console.log(`Time:     ${anchor.anchored_at}`);
    console.log("\n🔗 Verify on explorer:");
    console.log(buildIotaExplorerUrl(anchor.transaction_id, "tx") ?? anchor.transaction_id);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Anchor failed: ${message}`);
    process.exitCode = 1;
  }
}

void main();
