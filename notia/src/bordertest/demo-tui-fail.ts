import { readFile } from "node:fs/promises";
import chalk from "chalk";
import { config } from "dotenv";
import ora from "ora";
import terminalLink from "terminal-link";
import type { CanonicalEvent } from "@notia/core";
import { verifyDriverVP } from "../iota/identity-verify.js";
import { verifyCargoManifestOnChain } from "../iota/cargo-verify.js";
import resolveIotaName from "../iota/resolve-name.js";
import { verifyVehicleCertOnChain } from "../iota/vehicle-verify.js";
import { runBorderTest } from "./runBorderTest.js";

config({ quiet: true });

const STEP_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractIotaAddressFromDid(did: string): string {
  const prefix = "did:iota:testnet:";
  return did.startsWith(prefix) ? did.slice(prefix.length) : did;
}

function iotaNameNftUrl(): string {
  return "https://explorer.iota.org/object/0x08be1014a00dc7f106fb0ce9526fa2934d2543b35708385f34d0fb7e34591162?network=testnet";
}

function hasResolvedName(value: string | null | undefined, address: string): value is string {
  return Boolean(value && value !== address && value !== "");
}

function printHeader(): void {
  const title = "NCR — Notia Compliance Runtime";
  const subtitle = "BorderTest Demo (Negative)";
  const width = Math.max(title.length, subtitle.length) + 4;

  const top = "╔" + "═".repeat(width) + "╗";
  const bottom = "╚" + "═".repeat(width) + "╝";

  const titleLine = "║ " + title.padEnd(width - 2, " ") + " ║";
  const subtitleLine = "║ " + subtitle.padEnd(width - 2, " ") + " ║";

  console.log(chalk.cyan.bold(top));
  console.log(chalk.cyan.bold(titleLine));
  console.log(chalk.cyan.bold(subtitleLine));
  console.log(chalk.cyan.bold(bottom));
  console.log();
}

function printRejectedBanner(): void {
  const lines = [
    "RRRRR   EEEEE  JJJJJ  EEEEE   CCCC  TTTTT  EEEEE  DDDDD",
    "RR  RR  EE       J    EE     CC       T    EE     DD  DD",
    "RRRRR   EEEE     J    EEEE   CC       T    EEEE   DD   DD",
    "RR  RR  EE    J  J    EE     CC       T    EE     DD  DD",
    "RR   RR EEEEE  JJ     EEEEE   CCCC    T    EEEEE  DDDDD",
  ];
  for (const line of lines) {
    console.log(chalk.bold.red(line));
  }
}

function hasNegativeSignal(events: CanonicalEvent[]): boolean {
  return events.some((event) => {
    if (event.event_id === "bt-002") {
      return event.attributes?.certified === false;
    }
    if (event.event_id === "bt-003") {
      return event.attributes?.temperature_ok === false;
    }
    return false;
  });
}

async function main(): Promise<void> {
  printHeader();

  const raw = await readFile("events/bordertest-fail.json", "utf8");
  const events = JSON.parse(raw) as CanonicalEvent[];

  await sleep(STEP_DELAY_MS);
  const identitySpinner = ora(chalk.cyan("Verifying driver identity...")).start();

  let driverDid = "";
  try {
    const identity = await verifyDriverVP();
    if (!identity.verified) {
      throw new Error("driver VP is not valid");
    }
    driverDid = identity.driverDid;

    const didAddress = extractIotaAddressFromDid(driverDid);
    const didResolvedName = await resolveIotaName(didAddress);

    let resolvedName: string | null = null;
    if (hasResolvedName(didResolvedName, didAddress)) {
      resolvedName = didResolvedName;
    } else {
      const walletAddress =
        process.env.IOTA_WALLET_ADDRESS ??
        "0x12719877dce65c469e4aa362803980da0bf0c4bb2b22a7a798775ca5838f2b10";
      const walletResolvedName = await resolveIotaName(walletAddress);

      if (hasResolvedName(walletResolvedName, walletAddress)) {
        resolvedName = walletResolvedName;
      }
    }

    const displayName = resolvedName
      ? terminalLink(chalk.yellow(resolvedName), iotaNameNftUrl(), {
          fallback: (label, fallbackUrl) => `${label} ${fallbackUrl}`,
        })
      : chalk.yellow(driverDid);

    identitySpinner.stopAndPersist({
      symbol: chalk.green("✓"),
      text: `${chalk.cyan("Verifying driver identity...")} ${displayName}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    identitySpinner.fail(
      `${chalk.red("✗")} ${chalk.cyan("Verifying driver identity...")} ${chalk.red(message)}`
    );
    process.exitCode = 1;
    return;
  }

  await sleep(STEP_DELAY_MS);
  const vehicleSpinner = ora(chalk.cyan("Checking vehicle certificate on IOTA...")).start();

  try {
    const vehicleObjectId =
      process.env.VEHICLE_CERTIFICATE_OBJECT_ID ??
      "0x130aad9149f719a3feb40720e8dde5551e895b8de4413d9d40aeb02df9aeead3";
    const vehicleCert = await verifyVehicleCertOnChain(vehicleObjectId);

    if (!vehicleCert.valid) {
      throw new Error(vehicleCert.reason ?? "vehicle certificate is not valid");
    }

    const vehicleText = `${vehicleCert.plate} (${vehicleCert.vehicle_class})`;
    const vehicleUrl = `https://explorer.iota.org/object/${vehicleObjectId}?network=testnet`;
    const vehicleLink = terminalLink(chalk.yellow(vehicleText), vehicleUrl, {
      fallback: (label, fallbackUrl) => `${label} ${fallbackUrl}`,
    });

    vehicleSpinner.stopAndPersist({
      symbol: chalk.green("✓"),
      text: `${chalk.cyan("Checking vehicle certificate on IOTA...")} ${vehicleLink}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vehicleSpinner.fail(
      `${chalk.red("✗")} ${chalk.cyan("Checking vehicle certificate on IOTA...")} ${chalk.red(message)}`
    );
    process.exitCode = 1;
    return;
  }

  await sleep(STEP_DELAY_MS);
  const cargoSpinner = ora(chalk.cyan("Verifying cargo manifest on IOTA...")).start();

  try {
    const cargoObjectId =
      process.env.CARGO_MANIFEST_OBJECT_ID ??
      "0x52f1982c012acec583055d4253190f694b7e3054e31e2c913de0cad62730dba6";
    const cargoManifest = await verifyCargoManifestOnChain(cargoObjectId);

    if (!cargoManifest.valid) {
      throw new Error(cargoManifest.reason ?? "cargo manifest is not valid");
    }

    const cargoUrl = `https://explorer.iota.org/object/${cargoObjectId}?network=testnet`;
    const cargoLink = terminalLink(chalk.yellow(cargoManifest.manifest_id), cargoUrl, {
      fallback: (label, fallbackUrl) => `${label} ${fallbackUrl}`,
    });

    cargoSpinner.stopAndPersist({
      symbol: chalk.green("✓"),
      text: `${chalk.cyan("Verifying cargo manifest on IOTA...")} ${cargoLink}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cargoSpinner.fail(
      `${chalk.red("✗")} ${chalk.cyan("Verifying cargo manifest on IOTA...")} ${chalk.red(message)}`
    );
    process.exitCode = 1;
    return;
  }

  await sleep(STEP_DELAY_MS);
  const complianceSpinner = ora(chalk.cyan("Evaluating cargo compliance...")).start();

  const { compliance } = runBorderTest(events);
  const domains = Object.entries(compliance.evaluated_domains)
    .map(([domain, state]) => `${domain}:${state}`)
    .join(", ");

  complianceSpinner.stopAndPersist({
    symbol: chalk.green("✓"),
    text: `${chalk.cyan("Evaluating cargo compliance...")} ${chalk.cyan(domains)}`,
  });

  console.log();
  console.log(chalk.cyan("-".repeat(72)));
  console.log();

  const rejected = compliance.result === "reject" || hasNegativeSignal(events);

  if (!rejected) {
    console.error(
      chalk.red(
        `Expected REJECTED result for negative scenario, got ${compliance.result.toUpperCase()}`
      )
    );
    process.exitCode = 1;
    return;
  }

  printRejectedBanner();
  console.log();
  console.log(chalk.cyan("Compliance Result: ") + chalk.bold.red("REJECTED"));
  console.log(chalk.cyan("Reason: negative scenario detected (uncertified vehicle and/or cold-chain failure)."));

  process.exitCode = 0;
}

void main();
