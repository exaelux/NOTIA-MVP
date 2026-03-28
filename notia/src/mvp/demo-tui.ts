import { createHash } from "node:crypto";
import * as readline from "node:readline";
import chalk from "chalk";
import { config } from "dotenv";
import ora from "ora";
import type { CanonicalEvent } from "@notia/core";
import { loadScenarioProfile } from "../bordertest/profile.js";
import type { ScenarioProfile } from "../bordertest/profile.js";
import { runCanonical } from "../canonical/runCanonical.js";
import { verifyDriverVP } from "../iota/identity-verify.js";
import type { DriverIdentityResult } from "../iota/identity-verify.js";
import { verifyVehicleCertOnChain } from "../iota/vehicle-verify.js";
import type { VehicleCertResult } from "../iota/vehicle-verify.js";
import { verifyCargoManifestOnChain } from "../iota/cargo-verify.js";
import type { CargoManifestResult } from "../iota/cargo-verify.js";
import { IotaNotarizationAdapter } from "../iota/notarization-anchor.js";
import { buildIotaExplorerUrl } from "../iota/explorer-link.js";

config({ quiet: true });

type OnlineProofs = {
  identity: DriverIdentityResult;
  asset: VehicleCertResult;
  evidence: CargoManifestResult;
  observedAt: {
    identity: string;
    asset: string;
    evidence: string;
  };
};

type OnlineProofFailure = {
  stage: "identity" | "asset" | "evidence";
  message: string;
};

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function formatMs(ms: number): string {
  return `${ms}ms`;
}

function printHeader(profile: ScenarioProfile): void {
  console.clear();
  console.log(chalk.cyan.bold("NOEMA / NOTIA ENGINE MVP"));
  console.log(chalk.dim("────────────────────────────────────────────────────────"));
  console.log(chalk.cyan("PROFILE: ") + chalk.yellow(profile.label));
  console.log(chalk.cyan("NETWORK: ") + chalk.yellow(profile.networkLabel));
  console.log(chalk.cyan("RUNTIME: ") + chalk.yellow(profile.runtimeVersion));
  console.log();
}

function askInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function waitForWalletRead(): Promise<Date> {
  await askInput(chalk.cyan("Press ENTER to read wallet... "));
  return new Date();
}

function shortRef(value: string, visible = 12): string {
  if (value.length <= visible * 2) {
    return value;
  }
  return `${value.slice(0, visible)}...${value.slice(-visible)}`;
}

function printRule(title: string): void {
  console.log(chalk.dim(title));
}

function buildMvpEvents(
  profile: ScenarioProfile,
  proofs: OnlineProofs,
  vehicleObjectId: string,
  cargoObjectId: string,
): CanonicalEvent[] {
  const startedMs = Date.now();

  return [
    {
      event_id: `mvp-${startedMs}-identity`,
      domain: "identity",
      type: "subject_identity_check",
      timestamp: proofs.observedAt.identity,
      subject_ref: profile.subjectRef,
      attributes: {
        identity_status: proofs.identity.verified ? "verified" : "revoked",
        credential_count: proofs.identity.credentialCount,
      },
      context: {
        source: "iota_online",
        subject_did: proofs.identity.driverDid,
      },
    },
    {
      event_id: `mvp-${startedMs}-asset`,
      domain: "token",
      type: "asset_state_check",
      timestamp: proofs.observedAt.asset,
      subject_ref: profile.subjectRef,
      attributes: {
        token_id: vehicleObjectId,
        certified: proofs.asset.valid,
        expired: proofs.asset.reason === "certificate_expired",
        asset_class: proofs.asset.vehicle_class,
      },
      context: {
        source: "iota_online",
        object_id: vehicleObjectId,
        public_identifier: proofs.asset.plate,
      },
    },
    {
      event_id: `mvp-${startedMs}-evidence`,
      domain: "supply",
      type: "evidence_integrity_check",
      timestamp: proofs.observedAt.evidence,
      subject_ref: profile.subjectRef,
      attributes: {
        manifest_id: proofs.evidence.manifest_id,
        logs: proofs.evidence.proof_logs,
        required_logs: proofs.evidence.required_logs,
      },
      context: {
        source: "iota_online",
        object_id: cargoObjectId,
      },
    },
  ];
}

function printProofSummary(
  profile: ScenarioProfile,
  proofs: OnlineProofs,
  vehicleObjectId: string,
  cargoObjectId: string,
  walletReadAtIso: string,
): void {
  printRule("INPUTS");
  console.log(chalk.dim("  WALLET READ: ") + chalk.yellow(walletReadAtIso));
  console.log(chalk.dim("  SUBJECT REF: ") + chalk.yellow(profile.subjectRef));
  console.log(chalk.cyan("  IDENTITY: ") + chalk.green("VERIFIED"));
  console.log(chalk.dim("    OBSERVED AT: ") + chalk.yellow(proofs.observedAt.identity));
  console.log(chalk.dim("    DID: ") + chalk.yellow(proofs.identity.driverDid));
  console.log(chalk.dim("    VC COUNT: ") + chalk.yellow(String(proofs.identity.credentialCount)));
  console.log(chalk.cyan("  ASSET: ") + chalk.green("VERIFIED"));
  console.log(chalk.dim("    OBSERVED AT: ") + chalk.yellow(proofs.observedAt.asset));
  console.log(
    chalk.dim("    REF: ") +
      chalk.yellow(`${proofs.asset.plate} · ${proofs.asset.vehicle_class}`),
  );
  console.log(chalk.dim("    OBJECT: ") + chalk.yellow(vehicleObjectId));
  console.log(chalk.cyan("  EVIDENCE: ") + chalk.green("VERIFIED"));
  console.log(chalk.dim("    OBSERVED AT: ") + chalk.yellow(proofs.observedAt.evidence));
  console.log(chalk.dim("    MANIFEST: ") + chalk.yellow(proofs.evidence.manifest_id));
  console.log(
    chalk.dim("    LOGS: ") +
      chalk.yellow(`${proofs.evidence.proof_logs.length}/${proofs.evidence.required_logs.length}`),
  );
  console.log(chalk.dim("    OBJECT: ") + chalk.yellow(cargoObjectId));
  console.log();
}

function printSemanticSummary(
  result: ReturnType<typeof runCanonical>,
  complianceHash: string,
): void {
  printRule("SEMANTICS");
  console.log(chalk.cyan("  BUNDLES: ") + chalk.yellow(String(result.bundles.length)));
  for (const [domain, state] of Object.entries(result.compliance.evaluated_domains)) {
    const tone =
      state === "valid" ? chalk.green : state === "hold" ? chalk.yellow : chalk.red;
    console.log(chalk.dim(`    ${domain.toUpperCase()}: `) + tone(state.toUpperCase()));
  }
  console.log(chalk.cyan("  OUTCOME: ") + (
    result.compliance.result === "valid"
      ? chalk.bold.green("VALID")
      : result.compliance.result === "hold"
        ? chalk.bold.yellow("HOLD")
        : chalk.bold.red("REJECT")
  ));
  console.log(chalk.dim("  COMPLIANCE HASH: ") + chalk.yellow(shortRef(complianceHash, 16)));
  console.log();
}

function printAuditTrail(
  profile: ScenarioProfile,
  proofs: OnlineProofs,
  vehicleObjectId: string,
  cargoObjectId: string,
  complianceHash: string,
  walletReadAtIso: string,
  totalElapsedMs: number,
  anchor?: { transactionId: string; status: string; network: string },
): void {
  printRule("OUTPUT");
  console.log(chalk.dim("  WALLET READ: ") + chalk.yellow(walletReadAtIso));
  console.log(chalk.dim("  ELAPSED: ") + chalk.yellow(formatMs(totalElapsedMs)));
  console.log(chalk.dim("  PROFILE: ") + chalk.yellow(profile.anchorProfileId));
  console.log(chalk.dim("  SUBJECT DID: ") + chalk.yellow(proofs.identity.driverDid));
  console.log(chalk.dim("  ASSET OBJECT: ") + chalk.yellow(vehicleObjectId));
  console.log(chalk.dim("  EVIDENCE OBJECT: ") + chalk.yellow(cargoObjectId));
  console.log(chalk.dim("  COMPLIANCE HASH: ") + chalk.yellow(complianceHash));

  if (!anchor) {
    console.log(chalk.dim("  ANCHOR: ") + chalk.yellow("NOT_SUBMITTED"));
    console.log();
    return;
  }

  console.log(chalk.dim("  ANCHOR NETWORK: ") + chalk.yellow(anchor.network));
  console.log(chalk.dim("  ANCHOR STATUS: ") + chalk.yellow(anchor.status));
  console.log(chalk.dim("  ANCHOR TX: ") + chalk.yellow(anchor.transactionId));
  const anchorUrl = buildIotaExplorerUrl(anchor.transactionId, "tx");
  if (anchorUrl) {
    console.log(chalk.dim("  EXPLORER: ") + chalk.yellow(anchorUrl));
  }
  console.log();
}

async function collectOnlineProofs(
  vehicleObjectId: string,
  cargoObjectId: string,
): Promise<OnlineProofs> {
  const observe = async <T>(promise: Promise<T>): Promise<{ value: T; observedAt: string }> => {
    const value = await promise;
    return { value, observedAt: new Date().toISOString() };
  };

  const [identitySettled, assetSettled, evidenceSettled] = await Promise.allSettled([
    observe(verifyDriverVP()),
    observe(verifyVehicleCertOnChain(vehicleObjectId)),
    observe(verifyCargoManifestOnChain(cargoObjectId)),
  ]);

  if (identitySettled.status === "rejected") {
    throw {
      stage: "identity",
      message: identitySettled.reason instanceof Error
        ? identitySettled.reason.message
        : String(identitySettled.reason),
    } satisfies OnlineProofFailure;
  }
  if (assetSettled.status === "rejected") {
    throw {
      stage: "asset",
      message: assetSettled.reason instanceof Error
        ? assetSettled.reason.message
        : String(assetSettled.reason),
    } satisfies OnlineProofFailure;
  }
  if (evidenceSettled.status === "rejected") {
    throw {
      stage: "evidence",
      message: evidenceSettled.reason instanceof Error
        ? evidenceSettled.reason.message
        : String(evidenceSettled.reason),
    } satisfies OnlineProofFailure;
  }

  if (!identitySettled.value.value.verified) {
    throw { stage: "identity", message: "subject proof is not valid" } satisfies OnlineProofFailure;
  }
  if (!assetSettled.value.value.valid) {
    throw {
      stage: "asset",
      message: assetSettled.value.value.reason ?? "asset proof is not valid",
    } satisfies OnlineProofFailure;
  }
  if (!evidenceSettled.value.value.valid) {
    throw {
      stage: "evidence",
      message: evidenceSettled.value.value.reason ?? "evidence proof is not valid",
    } satisfies OnlineProofFailure;
  }

  return {
    identity: identitySettled.value.value,
    asset: assetSettled.value.value,
    evidence: evidenceSettled.value.value,
    observedAt: {
      identity: identitySettled.value.observedAt,
      asset: assetSettled.value.observedAt,
      evidence: evidenceSettled.value.observedAt,
    },
  };
}

async function main(): Promise<void> {
  const profile = await loadScenarioProfile();
  const vehicleObjectId = process.env.VEHICLE_CERTIFICATE_OBJECT_ID ?? profile.vehicleCertificateObjectId;
  const cargoObjectId = process.env.CARGO_MANIFEST_OBJECT_ID ?? profile.cargoManifestObjectId;

  if (!vehicleObjectId) {
    throw new Error("Missing VEHICLE_CERTIFICATE_OBJECT_ID");
  }
  if (!cargoObjectId) {
    throw new Error("Missing CARGO_MANIFEST_OBJECT_ID");
  }

  printHeader(profile);
  const walletReadAt = await waitForWalletRead();
  const walletReadAtIso = walletReadAt.toISOString();

  const scanStartedMs = walletReadAt.getTime();
  const proofsSpinner = ora(chalk.cyan("INPUTS")).start();

  let proofs: OnlineProofs;
  try {
    const proofsStartedAt = Date.now();
    proofs = await collectOnlineProofs(vehicleObjectId, cargoObjectId);
    proofsSpinner.stopAndPersist({
      symbol: chalk.green("✓"),
      text: chalk.green(`INPUTS READY (${formatMs(elapsedMs(proofsStartedAt))})`),
    });
  } catch (error) {
    const failure =
      typeof error === "object" && error !== null && "stage" in error && "message" in error
        ? (error as OnlineProofFailure)
        : {
            stage: "identity",
            message: error instanceof Error ? error.message : String(error),
          };
    proofsSpinner.fail(
      chalk.red(
        `INPUTS FAILED (${failure.stage.toUpperCase()}): ${failure.message}`,
      ),
    );
    process.exitCode = 1;
    return;
  }

  printProofSummary(profile, proofs, vehicleObjectId, cargoObjectId, walletReadAtIso);

  const semanticSpinner = ora(chalk.cyan("SEMANTICS")).start();
  const semanticsStartedAt = Date.now();

  const events = buildMvpEvents(profile, proofs, vehicleObjectId, cargoObjectId);
  const semantic = runCanonical(events);
  const complianceHash = createHash("sha256")
    .update(
      JSON.stringify({
        bundle_refs: semantic.compliance.bundle_refs,
        result: semantic.compliance.result,
        profile_id: profile.anchorProfileId,
        wallet_read_iso: walletReadAtIso,
        event_timestamps: proofs.observedAt,
      }),
    )
    .digest("hex");

  semanticSpinner.stopAndPersist({
    symbol: semantic.compliance.result === "valid" ? chalk.green("✓") : chalk.yellow("!"),
    text:
      semantic.compliance.result === "valid"
        ? chalk.green(`SEMANTICS READY (${formatMs(elapsedMs(semanticsStartedAt))})`)
        : chalk.yellow(
            `SEMANTICS READY (${semantic.compliance.result.toUpperCase()} · ${formatMs(elapsedMs(semanticsStartedAt))})`,
          ),
  });

  printSemanticSummary(semantic, complianceHash);

  if (semantic.compliance.result !== "valid") {
    printAuditTrail(
      profile,
      proofs,
      vehicleObjectId,
      cargoObjectId,
      complianceHash,
      walletReadAtIso,
      elapsedMs(scanStartedMs),
    );
    process.exitCode = 1;
    return;
  }

  const anchorSpinner = ora(chalk.cyan("ANCHOR")).start();
  const anchorStartedAt = Date.now();
  try {
    const adapter = new IotaNotarizationAdapter();
    const anchor = await adapter.submitProof({
      subject_ref: profile.subjectRef,
      profile_id: profile.anchorProfileId,
      result: true,
      bundle_hash: complianceHash,
    });
    anchorSpinner.stopAndPersist({
      symbol: chalk.green("✓"),
      text: chalk.green(`ANCHOR READY (${formatMs(elapsedMs(anchorStartedAt))})`),
    });
    printAuditTrail(
      profile,
      proofs,
      vehicleObjectId,
      cargoObjectId,
      complianceHash,
      walletReadAtIso,
      elapsedMs(scanStartedMs),
      {
        transactionId: anchor.transaction_id,
        status: anchor.status,
        network: anchor.network,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    anchorSpinner.fail(chalk.red(`ANCHOR FAILED: ${message}`));
    printAuditTrail(
      profile,
      proofs,
      vehicleObjectId,
      cargoObjectId,
      complianceHash,
      walletReadAtIso,
      elapsedMs(scanStartedMs),
    );
    process.exitCode = 1;
    return;
  }

  console.log(chalk.bold.green("STATUS: COMPLETE"));
}

void main();
