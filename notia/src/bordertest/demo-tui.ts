import { createHash } from "node:crypto";
import * as readline from "node:readline";
import { readFile } from "node:fs/promises";
import chalk from "chalk";
import { config } from "dotenv";
import ora from "ora";
import terminalLink from "terminal-link";
import type { CanonicalEvent } from "@notia/core";
import { verifyDriverVP, type DriverIdentityResult } from "../iota/identity-verify.js";
import { IotaNotarizationAdapter } from "../iota/notarization-anchor.js";
import {
  verifyCargoManifestOnChain,
  type CargoManifestResult,
} from "../iota/cargo-verify.js";
import resolveIotaName from "../iota/resolve-name.js";
import { buildIotaExplorerUrl, extractAddressFromDid } from "../iota/explorer-link.js";
import {
  verifyVehicleCertOnChain,
  type VehicleCertResult,
} from "../iota/vehicle-verify.js";
import { runBorderTest } from "./runBorderTest.js";
import {
  loadScenarioProfile,
  resolveProfilePath,
  type ScenarioProfile,
} from "./profile.js";

config({ quiet: true });

const STEP_DELAY_MS = 500;
const ALWAYS_ON = process.env.NOTIA_ALWAYS_ON === "1";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const REQUIRED_SUPPLY_LOGS = [
  "cold_chain_temperature_log",
  "geo_tracking_log",
  "weight_verification_scan",
  "humidity_sensor_data",
  "seal_integrity_check",
  "xray_scan_result",
];

type ScanSnapshot = {
  epochMs: number;
  iso: string;
  date: string;
  time: string;
};

type EventSourceMode = "onchain" | "file";

function resolveEventSource(profile: ScenarioProfile): EventSourceMode {
  const source = (process.env.NCR_EVENT_SOURCE ?? profile.eventSource ?? "onchain")
    .trim()
    .toLowerCase();
  return source === "file" ? "file" : "onchain";
}

async function loadFileEvents(profile: ScenarioProfile): Promise<CanonicalEvent[]> {
  if (!profile.eventsPath || profile.eventsPath.trim() === "") {
    throw new Error("eventsPath is required when NCR_EVENT_SOURCE=file");
  }
  const eventsPath = resolveProfilePath(profile.eventsPath);
  const raw = await readFile(eventsPath, "utf8");
  return JSON.parse(raw) as CanonicalEvent[];
}

function buildOnChainEvents(
  scanSnapshot: ScanSnapshot,
  profile: ScenarioProfile,
  identity: DriverIdentityResult,
  vehicleObjectId: string,
  vehicleCert: VehicleCertResult,
  cargoObjectId: string,
  cargoManifest: CargoManifestResult
): CanonicalEvent[] {
  const timestampAt = (offsetSeconds: number): string =>
    new Date(scanSnapshot.epochMs + offsetSeconds * 1000).toISOString();

  return [
    {
      event_id: `scan-${scanSnapshot.epochMs}-identity`,
      domain: "identity",
      type: "driver_identity_check",
      timestamp: timestampAt(0),
      subject_ref: identity.driverDid,
      attributes: {
        identity_status: identity.verified ? "verified" : "revoked",
        credential_count: identity.credentialCount,
      },
      context: { source: "iota_onchain" },
    },
    {
      event_id: `scan-${scanSnapshot.epochMs}-vehicle`,
      domain: "token",
      type: "vehicle_cert_check",
      timestamp: timestampAt(1),
      subject_ref: profile.subjectRef,
      attributes: {
        token_id: vehicleObjectId,
        certified: vehicleCert.valid,
        expired: false,
        plate: vehicleCert.plate,
        vehicle_class: vehicleCert.vehicle_class,
      },
      context: {
        source: "iota_onchain",
        object_id: vehicleObjectId,
      },
    },
    {
      event_id: `scan-${scanSnapshot.epochMs}-cargo`,
      domain: "supply",
      type: "pharma_cargo_check",
      timestamp: timestampAt(2),
      subject_ref: `cargo:manifest:${cargoManifest.manifest_id}`,
      attributes: {
        manifest_id: cargoManifest.manifest_id,
        logs: REQUIRED_SUPPLY_LOGS,
      },
      context: {
        source: "iota_onchain",
        object_id: cargoObjectId,
      },
    },
  ];
}

function hasResolvedName(value: string | null | undefined, address: string): value is string {
  return Boolean(value && value !== address && value !== "");
}

function inlineLink(text: string, url: string): string {
  const showUrlFallback = process.env.NCR_LINK_FALLBACK_URL !== "0";
  const linked = terminalLink(text, url, {
    fallback: (label, fallbackUrl) => (showUrlFallback ? `${label} ${fallbackUrl}` : label),
  });
  return linked;
}

function printHeader(): void {
  const title = "NCR — Notia Compliance Runtime";
  const subtitle = "Scenario Runtime";
  const width = Math.max(title.length, subtitle.length) + 4;

  const top = "╔" + "═".repeat(width) + "╗";
  const bottom = "╚" + "═".repeat(width) + "╝";

  const titleLine =
    "║ " + title.padEnd(width - 2, " ") + " ║";
  const subtitleLine =
    "║ " + subtitle.padEnd(width - 2, " ") + " ║";

  console.log(chalk.cyan.bold(top));
  console.log(chalk.cyan.bold(titleLine));
  console.log(chalk.cyan.bold(subtitleLine));
  console.log(chalk.cyan.bold(bottom));
  console.log();
}

function printResultBanner(passed: boolean): void {
  if (passed) {
    const lines = [
      "PPPPPP     A     SSSSS  SSSSS  EEEEE  DDDDD",
      "PP   PP   A A    SS     SS     EE     DD  DD",
      "PPPPPP   AAAAA   SSSSS  SSSSS  EEEE   DD   DD",
      "PP      AA   AA      SS     SS EE     DD  DD",
      "PP      AA   AA  SSSSS  SSSSS  EEEEE  DDDDD",
    ];
    for (const line of lines) {
      console.log(chalk.bold.green(line));
    }
    return;
  }

  const lines = [
    "FFFFFF   A     III  L      EEEEE  DDDDD",
    "FF      A A     I   L      EE     DD  DD",
    "FFFF   AAAAA    I   L      EEEE   DD   DD",
    "FF    AA   AA   I   L      EE     DD  DD",
    "FF    AA   AA  III  LLLLL  EEEEE  DDDDD",
  ];
  for (const line of lines) {
    console.log(chalk.bold.red(line));
  }
}

type DemoTuiOptions = {
  showHeader?: boolean;
  profile?: ScenarioProfile;
  scanSnapshot?: ScanSnapshot;
};

export async function main(
  options: DemoTuiOptions = {}
): Promise<"to_header" | "to_header_pause" | "exit"> {
  const showHeader = options.showHeader ?? true;
  const profile = options.profile ?? await loadScenarioProfile();
  let pendingSnapshot = options.scanSnapshot;
  let restart = true;
  let hasPrintedHeader = false;
  while (restart) {
    restart = false;
    if (showHeader && !hasPrintedHeader) {
      printHeader();
      hasPrintedHeader = true;
    }
    const scanSnapshot = pendingSnapshot ?? {
      epochMs: Date.now(),
      iso: new Date().toISOString(),
      date: new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "2-digit",
        year: "numeric",
      }),
      time: new Date().toLocaleTimeString("en-US", { hour12: false }),
    };
    pendingSnapshot = undefined;
    console.log(chalk.dim(`Scan Snapshot: ${scanSnapshot.date} ${scanSnapshot.time}`));
    console.log();

  let identityResult: DriverIdentityResult | null = null;
  let vehicleResult: VehicleCertResult | null = null;
  let cargoResult: CargoManifestResult | null = null;
  const vehicleObjectId =
    process.env.VEHICLE_CERTIFICATE_OBJECT_ID ??
    profile.vehicleCertificateObjectId;
  const cargoObjectId =
    process.env.CARGO_MANIFEST_OBJECT_ID ??
    profile.cargoManifestObjectId;

  await sleep(STEP_DELAY_MS);
  const identitySpinner = ora(chalk.cyan("Verifying subject proof...")).start();

  let driverDid = "";
  try {
    const identity = await verifyDriverVP();
    if (!identity.verified) {
      throw new Error("subject proof is not valid");
    }
    identityResult = identity;
    driverDid = identity.driverDid;

    const didAddress = extractAddressFromDid(driverDid);
    const didResolvedName = await resolveIotaName(didAddress);

    let resolvedName: string | null = null;
    let resolvedIdentityAddress = didAddress;
    if (hasResolvedName(didResolvedName, didAddress)) {
      resolvedName = didResolvedName;
    } else {
      const walletAddress = (process.env.IOTA_WALLET_ADDRESS ?? "").trim();
      if (walletAddress && walletAddress !== didAddress) {
        const walletResolvedName = await resolveIotaName(walletAddress);
        if (hasResolvedName(walletResolvedName, walletAddress)) {
          resolvedName = walletResolvedName;
          resolvedIdentityAddress = walletAddress;
        }
      }
    }

    const identityUrl = resolvedName
      ? profile.identityNameObjectUrl ??
        buildIotaExplorerUrl(resolvedIdentityAddress, "address")
      : profile.identityNameObjectUrl ??
        buildIotaExplorerUrl(driverDid, "did");
    const identityLabel = resolvedName ?? driverDid;
    const displayName = identityUrl
      ? inlineLink(chalk.yellow(identityLabel), identityUrl)
      : chalk.yellow(identityLabel);

    identitySpinner.stopAndPersist({
      symbol: chalk.green("✓"),
      text: `${chalk.cyan("Verifying subject proof...")} ${displayName}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    identitySpinner.fail(
      `${chalk.red("✗")} ${chalk.cyan("Verifying subject proof...")} ${chalk.red(message)}`
    );
    process.exitCode = 1;
    if (ALWAYS_ON) {
      await sleep(1500);
      return "to_header_pause";
    }
    return "exit";
  }

  await sleep(STEP_DELAY_MS);
  const companyAddress = process.env.COMPANY_ADDRESS ?? "";
  const companyName = companyAddress ? await resolveIotaName(companyAddress) : null;
  const companyNameUrl =
    profile.companyNameObjectUrl ??
    (companyAddress ? buildIotaExplorerUrl(companyAddress, "address") : null);
  const companyBadge = companyName
    ? companyNameUrl
      ? inlineLink(chalk.yellow(companyName), companyNameUrl)
      : chalk.yellow(companyName)
    : "";
  const vehicleSpinner = ora(chalk.cyan("Verifying asset proof...")).start();

  try {
    const vehicleCert = await verifyVehicleCertOnChain(vehicleObjectId);

    if (!vehicleCert.valid) {
      throw new Error(vehicleCert.reason ?? "asset proof is not valid");
    }
    vehicleResult = vehicleCert;

    const vehicleText = `${vehicleCert.plate} (${vehicleCert.vehicle_class})`;
    const vehicleUrl = buildIotaExplorerUrl(vehicleObjectId, "object");
    const vehicleLink = vehicleUrl
      ? inlineLink(chalk.yellow(vehicleText), vehicleUrl)
      : chalk.yellow(vehicleText);

    vehicleSpinner.stopAndPersist({
      symbol: chalk.green("✓"),
      text: `${chalk.cyan("Verifying asset proof...")} ${vehicleLink}\n  ${chalk.cyan("└─ Issuer:")} ${companyBadge.trim()}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vehicleSpinner.fail(
      `${chalk.red("✗")} ${chalk.cyan("Verifying asset proof...")} ${chalk.red(message)}`
    );
    process.exitCode = 1;
    if (ALWAYS_ON) {
      await sleep(1500);
      return "to_header_pause";
    }
    return "exit";
  }

  await sleep(STEP_DELAY_MS);
  const cargoSpinner = ora(chalk.cyan("Verifying evidence proof...")).start();

  try {
    const cargoManifest = await verifyCargoManifestOnChain(cargoObjectId);

    if (!cargoManifest.valid) {
      throw new Error(cargoManifest.reason ?? "evidence proof is not valid");
    }
    cargoResult = cargoManifest;

    const cargoUrl = buildIotaExplorerUrl(cargoObjectId, "object");
    const cargoLink = cargoUrl
      ? inlineLink(chalk.yellow(cargoManifest.manifest_id), cargoUrl)
      : chalk.yellow(cargoManifest.manifest_id);

    cargoSpinner.stopAndPersist({
      symbol: chalk.green("✓"),
      text: `${chalk.cyan("Verifying evidence proof...")} ${cargoLink}\n  ${chalk.cyan("└─ Issuer:")} ${companyBadge.trim()}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cargoSpinner.fail(
      `${chalk.red("✗")} ${chalk.cyan("Verifying evidence proof...")} ${chalk.red(message)}`
    );
    process.exitCode = 1;
    if (ALWAYS_ON) {
      await sleep(1500);
      return "to_header_pause";
    }
    return "exit";
  }

  await sleep(STEP_DELAY_MS);
  const complianceSpinner = ora(chalk.cyan("Computing semantic validity...")).start();

  if (!identityResult || !vehicleResult || !cargoResult) {
    complianceSpinner.fail(chalk.red("Missing on-chain verification inputs."));
    process.exitCode = 1;
    if (ALWAYS_ON) {
      await sleep(1500);
      return "to_header_pause";
    }
    return "exit";
  }

  const eventSource = resolveEventSource(profile);
  const events =
    eventSource === "file"
      ? await loadFileEvents(profile)
      : buildOnChainEvents(
          scanSnapshot,
          profile,
          identityResult,
          vehicleObjectId,
          vehicleResult,
          cargoObjectId,
          cargoResult
        );
  const { compliance } = runBorderTest(events);
  const domainMap: Record<string, string> = {
    identity: "Identity",
    token: "Asset",
    supply: "Evidence",
  };
  const domainDisplay = Object.entries(compliance.evaluated_domains)
    .map(([domain, state]) => {
      const label = domainMap[domain] ?? domain;
      const icon = state === "valid" ? chalk.green("✓") : chalk.red("✗");
      const text = state === "valid" ? chalk.green(label) : chalk.red(label);
      return `${text} ${icon}`;
    })
    .join(chalk.cyan(" · "));
  complianceSpinner.stopAndPersist({
    symbol: chalk.green("✓"),
    text: `${chalk.cyan("Semantic compliance...")} ${domainDisplay}`,
  });

  console.log();
  console.log(chalk.cyan("-".repeat(72)));
  console.log();

  let runtimeState: "valid" | "hold" | "reject" = compliance.result === "valid" ? "valid" : "reject";

  const doAnchor = async (result: boolean, state: "valid" | "hold", manual_override: boolean) => {
    const anchorSpinner = ora(chalk.cyan("Registering compliance proof...")).start();
    const payload = {
      bundle_refs: compliance.bundle_refs,
      result,
      state,
      manual_override,
      profile_id: profile.anchorProfileId,
      timestamp: scanSnapshot.epochMs,
      scan_snapshot_iso: scanSnapshot.iso,
    };
    const complianceHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const adapter = new IotaNotarizationAdapter();
    try {
      const tx = await adapter.submitProof({
        subject_ref: profile.subjectRef,
        profile_id: profile.anchorProfileId,
        result,
        bundle_hash: complianceHash,
      });
      anchorSpinner.stopAndPersist({ symbol: chalk.green("✓"), text: chalk.green("Registered") });
      const explorerUrl = buildIotaExplorerUrl(tx.transaction_id, "tx");
      const txLabel = chalk.yellow(tx.transaction_id);
      console.log(chalk.cyan("TX ID: ") + (explorerUrl ? inlineLink(txLabel, explorerUrl) : txLabel));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      anchorSpinner.fail(chalk.red(`Anchor failed: ${msg}`));
    }
  };

  const askPassword = (prompt: string): Promise<string> => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(prompt, ans => { rl.close(); resolve(ans.trim()); }));
  };

  const askMenu = (options: string[]): Promise<string> => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log();
    options.forEach(o => console.log(chalk.cyan(o)));
    return new Promise(resolve => rl.question(chalk.cyan("> "), ans => { rl.close(); resolve(ans.trim()); }));
  };

  printResultBanner(runtimeState === "valid");
  console.log();
  const stateColor = runtimeState === "valid" ? chalk.bold.green : chalk.bold.red;
  console.log(chalk.cyan("Compliance State: ") + stateColor(runtimeState.toUpperCase()));
  console.log();

    if (runtimeState === "reject") {
    console.log(chalk.red("Compliance failed. No blockchain operation executed."));
    if (ALWAYS_ON) {
      console.log(chalk.yellow("Waiting for new registration..."));
      await sleep(1500);
      return "to_header_pause";
    }
    const choice = await askMenu(["[1] Exit", "[2] Wait for new registration"]);
      if (choice === "2") {
        return "to_header";
      }
      return "exit";
    }

    // VALID — operator menu
    if (ALWAYS_ON) {
      await doAnchor(true, "valid", false);
      await sleep(1000);
      return "to_header";
    }
    const choice = await askMenu(["[1] Continue", "[2] Hold (manual)", "[3] Reject (manual)"]);

    if (choice === "1") {
      await doAnchor(true, "valid", false);
      return "to_header";

    } else if (choice === "2") {
      const pwd = await askPassword(chalk.yellow("Password: "));
      if (pwd !== "1234") { console.log(chalk.red("Wrong password.")); return "exit"; }
      runtimeState = "hold";
      console.log(chalk.yellow("\nState Transition: VALID → HOLD"));
      console.log(chalk.yellow("Manual Hold applied\n"));
      printResultBanner(false);
      await doAnchor(false, "hold", true);
      const choice2 = await askMenu(["[1] Manual Pass", "[2] Exit"]);
      if (choice2 === "1") {
        const pwd2 = await askPassword(chalk.yellow("Password: "));
        if (pwd2 !== "1234") { console.log(chalk.red("Wrong password.")); return "exit"; }
        console.log(chalk.green("\nState Transition: HOLD → PASSED"));
        console.log(chalk.green("Manual override registered"));
        console.log(chalk.green("Registered\n"));
      }

    } else if (choice === "3") {
      const pwd = await askPassword(chalk.yellow("Password: "));
      if (pwd !== "1234") { console.log(chalk.red("Wrong password.")); return "exit"; }
      runtimeState = "reject";
      console.log(chalk.red("\nState Transition: VALID → REJECT"));
      console.log(chalk.red("Corrupted file, contact your provider."));
      console.log(chalk.red("No blockchain operation executed.\n"));
      const choice2 = await askMenu(["[1] Exit", "[2] Wait for new registration"]);
      if (choice2 === "2") {
        return "to_header";
      }
    }
    return "exit";
  }
  return "exit";
}
// void main();
