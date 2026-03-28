import { createHash } from "node:crypto";
import * as readline from "node:readline";
import chalk from "chalk";
import { config } from "dotenv";
import ora from "ora";
import terminalLink from "terminal-link";
import type { CanonicalEvent } from "@notia/core";
import { verifyDriverVP, type DriverIdentityResult } from "../iota/identity-verify.js";
import { verifyCargoManifestOnChain, type CargoManifestResult } from "../iota/cargo-verify.js";
import { verifyVehicleCertOnChain, type VehicleCertResult } from "../iota/vehicle-verify.js";
import { IotaNotarizationAdapter } from "../iota/notarization-anchor.js";
import resolveIotaName from "../iota/resolve-name.js";
import { buildIotaExplorerUrl, extractAddressFromDid } from "../iota/explorer-link.js";
import { loadScenarioProfile, type ScenarioProfile } from "../bordertest/profile.js";
import { runCanonical } from "./runCanonical.js";

config({ quiet: true });

const STEP_DELAY_MS = 500;

const AUTO_CHECK_INTERVAL_MS = Number.parseInt(
  process.env.NCR_CHECK_INTERVAL_MS ?? "",
  10
);
const LEGACY_CHECK_INTERVAL_SECONDS = Number.parseInt(
  process.env.NCR_CHECK_INTERVAL_SECONDS ?? "",
  10
);
const ONLINE_CHECK_INTERVAL_MS =
  Number.isFinite(AUTO_CHECK_INTERVAL_MS)
    ? Math.max(0, AUTO_CHECK_INTERVAL_MS)
    : Number.isFinite(LEGACY_CHECK_INTERVAL_SECONDS) && LEGACY_CHECK_INTERVAL_SECONDS > 0
      ? LEGACY_CHECK_INTERVAL_SECONDS * 1000
      : 0;
const ONLINE_LOOP_OK_DELAY_MS = Number.parseInt(process.env.NCR_ONLINE_OK_DELAY_MS ?? "250", 10);
const ONLINE_LOOP_FAIL_DELAY_MS = Number.parseInt(process.env.NCR_ONLINE_FAIL_DELAY_MS ?? "1200", 10);
// Keep canonical TUI stable: no auto-loop that repaints the frontend.
const CANONICAL_ALWAYS_ON = false;
const CANONICAL_INTERACTIVE_MENU = true;
const REQUIRED_SUPPLY_LOGS = [
  "cold_chain_temperature_log",
  "geo_tracking_log",
  "weight_verification_scan",
  "humidity_sensor_data",
  "seal_integrity_check",
  "xray_scan_result",
];

const LOGO = [
  "⠯⠟⢉⡽⠏⠤⢤⣤⡤⠤⠄⢤⣤⠤⠴⠤⠤⠠⠤⠴⠤⠆⠤⠤⠤⠤⠄",
  "⠉⠁⠉⠀⠉⠉⠉⠉⠁⠉⠀⠁⠀⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠰⣶⣿⣧⣄⠀⠀⠀⠀⢬⣽⣯⠀⠀⢀⣤⣾⣿⣿⣿⣿⣿⣿⣿⣿⠀⢸⣿⣿⣿⣿⣿⣿⣿⣯⣴⣤",
  "⠀⠀⠀⠀⠀⠀⠸⣿⣿⣿⣷⣤⡄⠄⠀⢸⣾⣧⠀⠔⣿⣿⠿⠛⠛⠛⠛⠛⠛⠛⠛⠀⢸⣿⣿⡟⠛⠛⠛⠛⢻⣿⢿⡆",
  "⠀⠀⠀⠀⠀⠀⢸⣿⣿⡿⡿⢿⣿⠆⢀⣿⣿⣿⢈⠾⡿⣿⠷⢰⠈⠉⠁⠀⠉⠀⡁⠀⢸⣿⣿⣇⣀⣀⣀⣀⣸⣷⣶⠇",
  "⠀⠀⠀⠀⠀⠀⢘⣿⣿⡇⠙⢻⣿⣛⡋⣙⣛⣛⣸⣘⣛⣛⣛⢸⠀⠀⠀⠀⠀⠀⠁⢀⣘⣿⣿⣿⣿⣿⣛⣛⣛⡛⠛",
  "⠀⠀⠀⠀⠀⠀⠨⠭⡽⠇⠀⠀⠹⠟⣿⣽⣯⣯⠠⠤⣿⣭⡯⠀⠀⠀⠠⠀⠀⠀⠆⠰⠾⡿⢿⠦⠘⠛⠛⠻⠿⣿⣦",
  "⠀⠀⠀⠀⠀⠀⢐⣒⣶⡇⠀⠀⠀⠑⢖⢒⠶⠖⠀⠘⠻⠿⠓⠲⠶⣶⣾⡶⠶⡶⣷⠘⢹⣟⣫⡋⠂⠀⠀⠀⢛⣩⣿⡆",
  "⠀⠀⠀⠀⠀⠀⠠⠭⠽⠇⠀⠀⠀⠀⠈⠫⠿⠷⠀⠀⠀⠊⠿⠾⠿⠿⠿⠿⠿⠿⠿⠀⠸⠿⠿⠇⠀⠀⠀⠀⠸⠿⠿⠇",
];

type BackendStageId = "identity" | "asset" | "evidence" | "semantic" | "anchor";
type BackendStageState = "pending" | "running" | "ok" | "fail";
type StepReporter = {
  stopAndPersist(opts: { symbol: string; text: string }): void;
  fail(text: string): void;
};

const BACKEND_FLOW: Array<{ id: BackendStageId; label: string; detail: string }> = [
  { id: "identity", label: "Identity Service", detail: "subject proof" },
  { id: "asset", label: "Asset Service", detail: "asset proof" },
  { id: "evidence", label: "Evidence Service", detail: "evidence proof" },
  { id: "semantic", label: "Semantic Engine", detail: "domain evaluation" },
  { id: "anchor", label: "Notarization Adapter", detail: "IOTA L1 tx anchor" },
];
const RESULT_OPTIONS_DIVIDER = chalk.dim("─────────────────────────────────────");

function createBackendState(): Record<BackendStageId, BackendStageState> {
  return {
    identity: "pending",
    asset: "pending",
    evidence: "pending",
    semantic: "pending",
    anchor: "pending",
  };
}

function stageIndicator(state: BackendStageState): string {
  if (state === "running") {
    return chalk.cyan("[~]");
  }
  if (state === "ok") {
    return chalk.green("[ok]");
  }
  if (state === "fail") {
    return chalk.red("[x]");
  }
  return chalk.gray("[ ]");
}

function stageLabel(text: string, state: BackendStageState): string {
  if (state === "running") {
    return chalk.cyan(text);
  }
  if (state === "ok") {
    return chalk.green(text);
  }
  if (state === "fail") {
    return chalk.red(text);
  }
  return chalk.gray(text);
}

function printBackendTree(state: Record<BackendStageId, BackendStageState>): void {
  console.log(chalk.dim("Backend Process Tree"));
  console.log(chalk.dim("└─ notia-canonical"));

  const lastIndex = BACKEND_FLOW.length - 1;
  for (const [index, row] of BACKEND_FLOW.entries()) {
    const branch = index === lastIndex ? "   └─" : "   ├─";
    const rowState = state[row.id];
    console.log(
      `${chalk.dim(branch)} ${stageIndicator(rowState)} ${stageLabel(row.label, rowState)} ${chalk.dim(`· ${row.detail}`)}`
    );
  }

  console.log();
}

const USE_CANONICAL_SPINNER = process.env.NCR_CANONICAL_SPINNER === "1";

function startStep(label: string): StepReporter {
  if (USE_CANONICAL_SPINNER) {
    return ora(chalk.cyan(label)).start() as unknown as StepReporter;
  }

  console.log(chalk.cyan("- " + label));
  return {
    stopAndPersist: ({ text }) => {
      console.log(text);
    },
    fail: (text) => {
      console.log(text);
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const NETWORK_TIMEOUT_MS = Number.parseInt(process.env.NCR_NETWORK_TIMEOUT_MS ?? "", 10);
const DEFAULT_NETWORK_TIMEOUT_MS = Number.isFinite(NETWORK_TIMEOUT_MS)
  ? Math.max(1000, NETWORK_TIMEOUT_MS)
  : 12000;

async function withTimeout<T>(label: string, task: Promise<T>, timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}


type ConnectivityState = "online" | "offline";
type ConnectivitySnapshot = {
  state: ConnectivityState;
  checkedAtIso: string;
  detail: string;
};

const MANUAL_VALID_AUTHORIZATION =
  process.env.NCR_MANUAL_VALID_AUTHORIZATION?.trim() || "MANUAL_VALID_AUTHORIZED";

let appConnectivity: ConnectivitySnapshot = {
  state: "offline",
  checkedAtIso: new Date().toISOString(),
  detail: "startup",
};

let headerClockInterval: NodeJS.Timeout | null = null;

function connectivityLine(snapshot: ConnectivitySnapshot = appConnectivity): string {
  if (snapshot.state === "online") {
    return `${chalk.green("●")} ${chalk.green("ONLINE")}`;
  }
  return `${chalk.red("○")} ${chalk.red("OFFLINE")}`;
}

function printConnectivity(prefix = "  "): void {
  console.log(prefix + chalk.cyan("Connection: ") + connectivityLine());
}

async function probeConnectivity(): Promise<ConnectivitySnapshot> {
  const identityEndpoint = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3002";
  const identityUrl = `${identityEndpoint}/driver/verify`;
  const rpcUrl = process.env.IOTA_RPC_URL?.trim();

  const checkIdentity = withTimeout(
    "identity endpoint probe",
    fetch(identityUrl, { method: "POST" }).then(() => true).catch(() => false),
    4000
  ).catch(() => false);

  const checkRpc = rpcUrl
    ? withTimeout(
        "rpc endpoint probe",
        fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "rpc.discover", params: [] }),
        })
          .then(() => true)
          .catch(() => false),
        4000
      ).catch(() => false)
    : Promise.resolve(false);

  const [identityOk, rpcOk] = await Promise.all([checkIdentity, checkRpc]);
  const detail = `identity:${identityOk ? "ok" : "fail"}, rpc:${rpcOk ? "ok" : "fail"}`;

  return {
    state: identityOk && rpcOk ? "online" : "offline",
    checkedAtIso: new Date().toISOString(),
    detail,
  };
}

async function refreshConnectivity(): Promise<ConnectivitySnapshot> {
  appConnectivity = await probeConnectivity();
  return appConnectivity;
}

function applyManualOverride(
  result: CanonicalScanResult,
  to: ComplianceResult,
  authorization: string
): CanonicalScanResult {
  const from = result.complianceResult;
  const next: CanonicalScanResult = {
    ...result,
    complianceResult: to,
    manualOverride: {
      from,
      to,
      authorization,
      atIso: new Date().toISOString(),
    },
  };

  if (to === "valid") {
    delete next.error;
    if (!result.anchor) {
      delete next.anchor;
    }
  } else {
    next.error = `Manual override applied: ${from.toUpperCase()} -> ${to.toUpperCase()} (${authorization})`;
    delete next.anchor;
  }

  return next;
}

function killRuntimeProcesses(): void {
  clearOnlinePanel();
}

async function showRejectTerminal(result: CanonicalScanResult): Promise<void> {
  killRuntimeProcesses();
  stopHeaderClock();
  console.clear();
  printResultMark(false);
  console.log();
  console.log(chalk.bold.red("Compliance State: REJECT"));
  printConnectivity();
  if (result.error) {
    console.log(chalk.red(result.error));
  }
  if (result.manualOverride) {
    console.log(
      chalk.yellow(
        `Manual authorization: ${result.manualOverride.authorization} @ ${result.manualOverride.atIso}`
      )
    );
  }
  console.log();
  await askInput(chalk.cyan("Press ENTER to return to header... "));
}

function hasResolvedName(value: string | null | undefined, address: string): value is string {
  return Boolean(value && value !== address && value !== "");
}

function formatTagWithName(tag: string, resolvedName: string | null | undefined): string {
  if (resolvedName && resolvedName !== tag) {
    return `${tag} (${resolvedName})`;
  }
  return tag;
}

function inlineLink(text: string, url: string): string {
  const showUrlFallback = process.env.NCR_LINK_FALLBACK_URL !== "0";
  return terminalLink(text, url, {
    fallback: (label, fallbackUrl) => (showUrlFallback ? `${label} ${fallbackUrl}` : label),
  });
}

function getDateTime(): { date: string; time: string } {
  const now = new Date();
  return {
    date: now.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "2-digit",
      year: "numeric",
    }),
    time: now.toLocaleTimeString("en-US", { hour12: false }),
  };
}

function stopHeaderClock(): void {
  if (headerClockInterval) {
    clearInterval(headerClockInterval);
    headerClockInterval = null;
  }
}

function renderHeaderClock(): void {
  if (!process.stdout.isTTY) {
    return;
  }

  const { date, time } = getDateTime();
  const headerClockRow = LOGO.length + 5;
  process.stdout.write(`\x1b7\x1b[${headerClockRow};1H\r\x1b[2K${chalk.dim(`  [${date} ${time}]`)}\x1b8`);
}

function startHeaderClock(): void {
  stopHeaderClock();
  if (!process.stdout.isTTY) {
    return;
  }

  renderHeaderClock();
  headerClockInterval = setInterval(renderHeaderClock, 1000);
}

function buildHeaderSubtitle(profile: ScenarioProfile): string {
  const explicit = process.env.NCR_CANONICAL_SUBTITLE?.trim();
  if (explicit) {
    return explicit;
  }

  return `${profile.label} · ${profile.networkLabel} · ${profile.runtimeVersion}`;
}

function printHeader(profile: ScenarioProfile, options: { showConnectivity?: boolean } = {}): void {
  const subtitle = buildHeaderSubtitle(profile);
  const { date, time } = getDateTime();
  const { showConnectivity = false } = options;

  stopHeaderClock();
  console.clear();
  for (const line of LOGO) {
    console.log(chalk.cyan("  " + line));
  }

  console.log();
  console.log(chalk.dim("  ─────────────────────────────────────"));
  console.log(chalk.cyan("  NOTIA Compliance Runtime"));
  console.log(chalk.dim("  " + subtitle));
  console.log(chalk.dim(`  [${date} ${time}]`));
  console.log(chalk.dim("  ─────────────────────────────────────"));

  if (showConnectivity) {
    printConnectivity("  ");
  }

  console.log();
  startHeaderClock();
}

function printResultMark(isValid: boolean): void {
  const markLines = isValid
    ? [
        "      ██",
        "     ██ ",
        "██  ██  ",
        " ████   ",
        "  ██    ",
      ]
    : [
        "██   ██",
        " ██ ██ ",
        "  ███  ",
        " ██ ██ ",
        "██   ██",
      ];

  for (const line of markLines) {
    console.log(isValid ? chalk.bold.green(line) : chalk.bold.red(line));
  }
}

function buildCanonicalEvents(
  scanEpochMs: number,
  subjectRef: string,
  vehicleObjectId: string,
  cargoObjectId: string,
  identity: DriverIdentityResult,
  vehicleCert: VehicleCertResult,
  cargoManifest: CargoManifestResult
): CanonicalEvent[] {
  const timestampAt = (offsetSeconds: number): string =>
    new Date(scanEpochMs + offsetSeconds * 1000).toISOString();

  return [
    {
      event_id: `canonical-${scanEpochMs}-identity`,
      domain: "identity",
      type: "subject_identity_check",
      timestamp: timestampAt(0),
      subject_ref: subjectRef,
      attributes: {
        identity_status: identity.verified ? "verified" : "revoked",
        credential_count: identity.credentialCount,
      },
      context: {
        source: "iota_onchain",
      },
    },
    {
      event_id: `canonical-${scanEpochMs}-asset`,
      domain: "token",
      type: "asset_state_check",
      timestamp: timestampAt(1),
      subject_ref: subjectRef,
      attributes: {
        token_id: vehicleObjectId,
        certified: vehicleCert.valid,
        expired: vehicleCert.reason === "certificate_expired",
      },
      context: {
        source: "iota_onchain",
        object_id: vehicleObjectId,
      },
    },
    {
      event_id: `canonical-${scanEpochMs}-evidence`,
      domain: "supply",
      type: "evidence_integrity_check",
      timestamp: timestampAt(2),
      subject_ref: subjectRef,
      attributes: {
        manifest_id: cargoManifest.manifest_id,
        logs: cargoManifest.proof_logs ?? [],
        required_logs: cargoManifest.required_logs ?? [],
      },
      context: {
        source: "iota_onchain",
        object_id: cargoObjectId,
      },
    },
  ];
}

type ComplianceResult = "valid" | "hold" | "reject";

type CanonicalScanResult = {
  backendState: Record<BackendStageId, BackendStageState>;
  scanIso: string;
  complianceResult: ComplianceResult;
  iotaRefs?: {
    subjectDid?: string;
    subjectAddress?: string;
    subjectName?: string;
    subjectNameSource?: "did" | "wallet";
    issuerAddress?: string;
    issuerName?: string;
    assetObjectId?: string;
    evidenceObjectId?: string;
  };
  error?: string;
  fingerprint?: string;
  manualOverride?: {
    from: ComplianceResult;
    to: ComplianceResult;
    authorization: string;
    atIso: string;
  };
  anchor?: {
    network: string;
    status: string;
    transactionId: string;
  };
};

function askInput(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

async function waitForEnter(): Promise<void> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    await askInput(chalk.cyan("Press ENTER to start NCR runtime... "));
    console.log();
    return;
  }

  const prompt = chalk.cyan("Press ENTER to start NCR runtime... ");

  await new Promise<void>((resolve) => {
    process.stdout.write(prompt);

    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\r\x1b[2K");
      console.log();
    };

    const onData = (chunk: Buffer) => {
      const input = chunk.toString("utf8");
      if (input === "\u0003") {
        cleanup();
        process.exit(130);
      }

      if (!input.includes("\r") && !input.includes("\n")) {
        return;
      }

      cleanup();
      resolve();
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function waitForNextAutoCheck(intervalMs: number): Promise<"rescan" | "to_header"> {
  const totalMs = Math.max(100, intervalMs);
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    await sleep(totalMs);
    return "rescan";
  }

  return await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const tickMs = 250;
    let remainingMs = totalMs;
    let settled = false;
    let interval: NodeJS.Timeout;

    const finish = (action: "rescan" | "to_header") => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      rl.close();
      process.stdout.write("\r\x1b[2K");
      resolve(action);
    };

    const render = () => {
      const { date, time } = getDateTime();
      const line = chalk.dim(
        `Online mode - next check in ${Math.max(0, remainingMs)}ms - ${date} ${time} - type "exit" + ENTER`
      );
      process.stdout.write(`\r\x1b[2K${line}`);
    };

    rl.on("line", (line) => {
      if (line.trim().toLowerCase() === "exit") {
        finish("to_header");
      }
    });

    render();
    interval = setInterval(() => {
      remainingMs -= tickMs;
      if (remainingMs <= 0) {
        finish("rescan");
        return;
      }
      render();
    }, tickMs);
  });
}


let onlinePanelLineCount = 0;

function clearOnlinePanel(): void {
  if (!process.stdout.isTTY || onlinePanelLineCount === 0) {
    return;
  }

  for (let i = 0; i < onlinePanelLineCount; i++) {
    process.stdout.write("\x1b[1A\r\x1b[2K");
  }
  onlinePanelLineCount = 0;
}


function renderOnlineLines(lines: string[]): void {
  if (!process.stdout.isTTY) {
    for (const line of lines) {
      console.log(line);
    }
    return;
  }

  clearOnlinePanel();
  for (const line of lines) {
    console.log(line);
  }
  onlinePanelLineCount = lines.length;
}

const CHECKING_FRAMES = ["checking   ", "checking.  ", "checking.. ", "checking..."];
let baselineFingerprint: string | null = null;
let lastOnlineResult: CanonicalScanResult | null = null;


function startCheckingPulse(): () => void {
  if (!process.stdout.isTTY) {
    console.log(chalk.cyan("Status: checking..."));
    return () => {};
  }

  let frame = 0;
  const render = () => {
    const { date, time } = getDateTime();
    const lines: string[] = [
      chalk.cyan(`Status: ${CHECKING_FRAMES[frame % CHECKING_FRAMES.length]}`),
      chalk.dim(`Online: ${date} ${time}`),
    ];

    if (lastOnlineResult) {
      const stateColor =
        lastOnlineResult.complianceResult === "valid"
          ? chalk.bold.green
          : lastOnlineResult.complianceResult === "hold"
            ? chalk.bold.yellow
            : chalk.bold.red;
      lines.push(
        chalk.dim("Last: ") +
          stateColor(lastOnlineResult.complianceResult.toUpperCase()) +
          chalk.dim(` · ${lastOnlineResult.scanIso}`)
      );
    }

    renderOnlineLines(lines);
    frame += 1;
  };

  render();
  const interval = setInterval(render, 250);
  return () => {
    clearInterval(interval);
  };
}

function renderOnlineStatus(result: CanonicalScanResult): void {
  lastOnlineResult = result;

  const stateColor =
    result.complianceResult === "valid"
      ? chalk.bold.green
      : result.complianceResult === "hold"
        ? chalk.bold.yellow
        : chalk.bold.red;

  const lines: string[] = [
    chalk.dim(`Scan Snapshot: ${result.scanIso}`),
    chalk.cyan("Compliance State: ") + stateColor(result.complianceResult.toUpperCase()),
  ];

  if (result.complianceResult === "valid" && result.anchor) {
    lines.push(chalk.cyan("Anchor Status: ") + chalk.yellow(result.anchor.status));
    lines.push(chalk.cyan("TX ID: ") + chalk.yellow(result.anchor.transactionId));
  } else if (result.error) {
    lines.push(chalk.dim(result.error));
  }

  renderOnlineLines(lines);
}

function printRuntimeResult(result: CanonicalScanResult): void {
  console.log(chalk.dim(`Scan Snapshot: ${result.scanIso}`));

  if (result.manualOverride) {
    console.log(
      chalk.yellow(
        `Manual override: ${result.manualOverride.from.toUpperCase()} -> ${result.manualOverride.to.toUpperCase()} (${result.manualOverride.authorization})`
      )
    );
  }

  if (result.complianceResult === "valid" && result.anchor) {
    console.log(`${chalk.cyan("Anchoring semantic proof on IOTA...")} ${chalk.green("done")}`);
    console.log(chalk.cyan("Anchor Network: ") + chalk.yellow(result.anchor.network));
    console.log(chalk.cyan("Anchor Status: ") + chalk.yellow(result.anchor.status));

    const explorerUrl = buildIotaExplorerUrl(result.anchor.transactionId, "tx");
    const txLabel = chalk.yellow(result.anchor.transactionId);
    console.log(chalk.cyan("TX ID: ") + (explorerUrl ? inlineLink(txLabel, explorerUrl) : txLabel));
    return;
  }

  if (result.error) {
    console.log(chalk.red(result.error));
  }
}

function printComplianceStateLine(result: CanonicalScanResult, prefix = ""): void {
  const stateColor =
    result.complianceResult === "valid"
      ? chalk.bold.green
      : result.complianceResult === "hold"
        ? chalk.bold.yellow
        : chalk.bold.red;
  console.log(prefix + chalk.cyan("Compliance State: ") + stateColor(result.complianceResult.toUpperCase()));
}

function formatExplorerValue(label: string, valueText: string, url: string | null): string {
  const base = chalk.dim(`  ${label}: `) + chalk.yellow(valueText);
  if (!url) {
    return base;
  }

  const openTag = inlineLink(chalk.cyan("↗ explorer"), url);
  return `${base} ${chalk.dim("·")} ${openTag}`;
}

function printIotaAnchors(result: CanonicalScanResult): void {
  console.log(chalk.dim("Audit Trail"));

  const refs = result.iotaRefs;

  if (refs?.subjectDid) {
    const didUrl = buildIotaExplorerUrl(refs.subjectDid, "did");
    console.log(formatExplorerValue("Subject DID", refs.subjectDid, didUrl));
  }

  if (refs?.subjectAddress) {
    const addressUrl = buildIotaExplorerUrl(refs.subjectAddress, "address");
    const addressText = refs.subjectName
      ? `${refs.subjectAddress} (${refs.subjectName})`
      : refs.subjectAddress;
    console.log(formatExplorerValue("Subject Address", addressText, addressUrl));
    if (refs.subjectNameSource) {
      console.log(chalk.dim("  Subject Name Source: ") + chalk.yellow(refs.subjectNameSource));
    }
  }

  if (refs?.issuerAddress) {
    const issuerUrl = buildIotaExplorerUrl(refs.issuerAddress, "address");
    const issuerText = refs.issuerName
      ? `${refs.issuerAddress} (${refs.issuerName})`
      : refs.issuerAddress;
    console.log(formatExplorerValue("Issuer Address", issuerText, issuerUrl));
  }

  if (refs?.assetObjectId) {
    const vehicleUrl = buildIotaExplorerUrl(refs.assetObjectId, "object");
    console.log(formatExplorerValue("Asset Object", refs.assetObjectId, vehicleUrl));
  }

  if (refs?.evidenceObjectId) {
    const cargoUrl = buildIotaExplorerUrl(refs.evidenceObjectId, "object");
    console.log(formatExplorerValue("Evidence Object", refs.evidenceObjectId, cargoUrl));
  }

  if (result.anchor) {
    const txUrl = buildIotaExplorerUrl(result.anchor.transactionId, "tx");
    console.log(chalk.dim("  Anchor Network: ") + chalk.yellow(result.anchor.network));
    console.log(chalk.dim("  Anchor Status: ") + chalk.yellow(result.anchor.status));
    console.log(formatExplorerValue("Anchor TX", result.anchor.transactionId, txUrl));
  }

  if (
    !refs?.subjectDid &&
    !refs?.subjectAddress &&
    !refs?.issuerAddress &&
    !refs?.assetObjectId &&
    !refs?.evidenceObjectId &&
    !result.anchor
  ) {
    console.log(chalk.dim("  No on-chain references captured for this scan."));
  }

  console.log();
}

function printOptionsSection(options: string[]): void {
  console.log(chalk.dim("Options"));
  for (const option of options) {
    console.log("  " + chalk.cyan(option));
  }
  console.log();
}

async function runManualDecision(result: CanonicalScanResult): Promise<CanonicalScanResult | null> {
  if (result.complianceResult === "reject") {
    console.log(chalk.red("Manual decision disabled: current state is REJECT."));
    return null;
  }

  if (result.complianceResult === "valid") {
    const typed = (await askInput(chalk.cyan('Type exact decision ["hold" or "reject"]: '))).trim().toLowerCase();
    if (typed !== "hold" && typed !== "reject") {
      console.log(chalk.red('Only exact values "hold" or "reject" are allowed while state is VALID.'));
      return null;
    }
    return applyManualOverride(result, typed as ComplianceResult, "operator_manual_state");
  }

  // Current state is HOLD.
  const typed = (await askInput(chalk.cyan('Type exact decision ["valid", "hold", "reject"]: '))).trim().toLowerCase();
  if (typed !== "valid" && typed !== "hold" && typed !== "reject") {
    console.log(chalk.red("Invalid manual decision."));
    return null;
  }

  if (typed === "valid") {
    if (result.error) {
      console.log(chalk.red("Manual VALID blocked: there are check errors present."));
      return null;
    }

    const connectivity = await refreshConnectivity();
    if (connectivity.state !== "online") {
      console.log(chalk.red("Manual VALID blocked: app is OFFLINE."));
      return null;
    }

    const auth = await askInput(
      chalk.yellow(`Type authorization phrase exactly (${MANUAL_VALID_AUTHORIZATION}): `)
    );
    if (auth !== MANUAL_VALID_AUTHORIZATION) {
      console.log(chalk.red("Authorization phrase mismatch."));
      return null;
    }

    return applyManualOverride(result, "valid", `manual_authorization:${auth}`);
  }

  return applyManualOverride(result, typed as ComplianceResult, "operator_manual_state");
}

async function showPostScanMenu(initialResult: CanonicalScanResult): Promise<"to_header" | "exit"> {
  const expectedPassword = (process.env.NCR_PROCESS_MENU_PASSWORD ?? "1234").trim() || "1234";
  let result = initialResult;

  while (true) {
    console.log();
    printComplianceStateLine(result);
    printResultMark(result.complianceResult === "valid");
    console.log();
    console.log(RESULT_OPTIONS_DIVIDER);
    console.log();
    console.log(chalk.cyan("[1] Options"));
    console.log();

    const choice = await askInput(chalk.cyan("> "));
    if (choice === "") {
      return "to_header";
    }
    if (choice === "1") {
      while (true) {
        console.log();
        printOptionsSection([
          "[1] Check process",
          "[2] Back",
          "[3] Exit",
        ]);

        const optionChoice = await askInput(chalk.cyan("> "));
        if (optionChoice === "2" || optionChoice === "") {
          console.clear();
          printRuntimeResult(result);
          break;
        }

        if (optionChoice === "1") {
          const password = await askInput(chalk.yellow("Password: "));
          if (password !== expectedPassword) {
            console.log(chalk.red("Wrong password."));
            continue;
          }

          while (true) {
            await refreshConnectivity();
            console.log();
            console.log(chalk.dim(`Scan Snapshot: ${result.scanIso}`));
            printConnectivity();
            printBackendTree(result.backendState);
            printIotaAnchors(result);
            printOptionsSection([
              "[1] Manual pass",
              "[2] Back",
            ]);

            const subChoice = await askInput(chalk.cyan("> "));
            if (subChoice === "2") {
              break;
            }
            if (subChoice !== "1") {
              console.log(chalk.red("Invalid option."));
              continue;
            }

            const updated = await runManualDecision(result);
            if (!updated) {
              continue;
            }

            result = updated;
            console.log();
            printRuntimeResult(result);

            if (result.complianceResult === "reject") {
              await showRejectTerminal(result);
              return "to_header";
            }
          }

          continue;
        }

        if (optionChoice === "3") {
          return "exit";
        }

        console.log(chalk.red("Invalid option."));
      }

      continue;
    }

    console.log(chalk.red("Invalid option."));
  }
}

async function runCanonicalScan(
  profile: ScenarioProfile,
  opts: { skipAnchor?: boolean } = {}
): Promise<CanonicalScanResult> {
  const snapshot = new Date();
  const scanEpochMs = snapshot.getTime();
  const scanIso = snapshot.toISOString();
  const backendState = createBackendState();
  const { skipAnchor = false } = opts;

  const connectivity = await refreshConnectivity();
  if (connectivity.state !== "online") {
    backendState.identity = "fail";
    return {
      backendState,
      scanIso,
      complianceResult: "reject",
      error: `Connectivity error: ${connectivity.detail}`,
    };
  }

  let subjectRef = profile.subjectRef;
  const vehicleObjectId =
    process.env.VEHICLE_CERTIFICATE_OBJECT_ID ?? profile.vehicleCertificateObjectId;
  const cargoObjectId =
    process.env.CARGO_MANIFEST_OBJECT_ID ?? profile.cargoManifestObjectId;
  const issuerAddress = (process.env.COMPANY_ADDRESS ?? "").trim();

  let subjectDid = "";
  let subjectAddress = "";
  let subjectName: string | null = null;
  let subjectNameSource: "did" | "wallet" | null = null;
  let issuerName: string | null = null;

  let identityResult: DriverIdentityResult | null = null;
  let vehicleResult: VehicleCertResult | null = null;
  let cargoResult: CargoManifestResult | null = null;
  let fingerprint = "";

  const buildRefs = (): NonNullable<CanonicalScanResult["iotaRefs"]> => {
    const refs: NonNullable<CanonicalScanResult["iotaRefs"]> = {};
    if (subjectDid) refs.subjectDid = subjectDid;
    if (subjectAddress) refs.subjectAddress = subjectAddress;
    if (subjectName) refs.subjectName = subjectName;
    if (subjectNameSource) refs.subjectNameSource = subjectNameSource;
    if (issuerAddress) refs.issuerAddress = issuerAddress;
    if (issuerName) refs.issuerName = issuerName;
    if (vehicleObjectId) refs.assetObjectId = vehicleObjectId;
    if (cargoObjectId) refs.evidenceObjectId = cargoObjectId;
    return refs;
  };

  await sleep(STEP_DELAY_MS);
  backendState.identity = "running";
  try {
    const identity = await withTimeout("identity verification", verifyDriverVP());
    if (!identity.verified) {
      throw new Error("subject proof is not valid");
    }

    identityResult = identity;
    subjectDid = identity.driverDid;

    const didAddress = extractAddressFromDid(identity.driverDid);
    subjectAddress = didAddress;

    const didResolvedName = await withTimeout("DID name resolution", resolveIotaName(didAddress), 5000);
    if (hasResolvedName(didResolvedName, didAddress)) {
      subjectName = didResolvedName;
      subjectNameSource = "did";
    } else {
      const walletAddress = (
        process.env.CANONICAL_SUBJECT_WALLET_ADDRESS ??
        process.env.IOTA_WALLET_ADDRESS ??
        ""
      ).trim();

      if (walletAddress && walletAddress !== didAddress) {
        const walletResolvedName = await withTimeout("wallet name resolution", resolveIotaName(walletAddress), 5000);
        if (hasResolvedName(walletResolvedName, walletAddress)) {
          subjectAddress = walletAddress;
          subjectName = walletResolvedName;
          subjectNameSource = "wallet";
        }
      }
    }

    backendState.identity = "ok";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    backendState.identity = "fail";
    return {
      backendState,
      scanIso,
      complianceResult: "reject",
      iotaRefs: buildRefs(),
      error: `Verifying subject proof failed: ${message}`,
    };
  }

  if (!vehicleObjectId) {
    backendState.asset = "fail";
    return {
      backendState,
      scanIso,
      complianceResult: "reject",
      iotaRefs: buildRefs(),
      error: "Missing VEHICLE_CERTIFICATE_OBJECT_ID",
    };
  }

  await sleep(STEP_DELAY_MS);
  backendState.asset = "running";
  try {
    if (issuerAddress) {
      const resolvedIssuer = await withTimeout("issuer name resolution", resolveIotaName(issuerAddress), 5000);
      if (hasResolvedName(resolvedIssuer, issuerAddress)) {
        issuerName = resolvedIssuer;
      }
    }

    const vehicleCert = await withTimeout("asset verification", verifyVehicleCertOnChain(vehicleObjectId));
    if (!vehicleCert.valid) {
      throw new Error(vehicleCert.reason ?? "asset proof is not valid");
    }

    vehicleResult = vehicleCert;
    backendState.asset = "ok";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    backendState.asset = "fail";
    return {
      backendState,
      scanIso,
      complianceResult: "reject",
      iotaRefs: buildRefs(),
      error: `Verifying asset proof failed: ${message}`,
    };
  }

  if (!cargoObjectId) {
    backendState.evidence = "fail";
    return {
      backendState,
      scanIso,
      complianceResult: "reject",
      iotaRefs: buildRefs(),
      error: "Missing CARGO_MANIFEST_OBJECT_ID",
    };
  }

  await sleep(STEP_DELAY_MS);
  backendState.evidence = "running";
  try {
    const cargoManifest = await withTimeout("evidence verification", verifyCargoManifestOnChain(cargoObjectId));
    if (!cargoManifest.valid) {
      throw new Error(cargoManifest.reason ?? "evidence proof is not valid");
    }

    cargoResult = cargoManifest;
    backendState.evidence = "ok";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    backendState.evidence = "fail";
    return {
      backendState,
      scanIso,
      complianceResult: "reject",
      iotaRefs: buildRefs(),
      error: `Verifying evidence proof failed: ${message}`,
    };
  }

  if (!identityResult || !vehicleResult || !cargoResult) {
    backendState.semantic = "fail";
    return {
      backendState,
      scanIso,
      complianceResult: "reject",
      iotaRefs: buildRefs(),
      error: "Missing on-chain verification inputs for semantic evaluation.",
    };
  }

  await sleep(STEP_DELAY_MS);
  backendState.semantic = "running";
  const events = buildCanonicalEvents(
    scanEpochMs,
    subjectRef,
    vehicleObjectId,
    cargoObjectId,
    identityResult,
    vehicleResult,
    cargoResult
  );
  const { compliance } = runCanonical(events);
  const complianceResult = compliance.result as ComplianceResult;

  fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        subjectDid,
        subjectAddress,
        issuerAddress,
        vehicleObjectId,
        cargoObjectId,
        identityVerified: identityResult.verified,
        credentialCount: identityResult.credentialCount,
        vehiclePlate: vehicleResult.plate,
        vehicleClass: vehicleResult.vehicle_class,
        manifestId: cargoResult.manifest_id,
        requiredLogs: cargoResult.required_logs ?? [],
        proofLogs: cargoResult.proof_logs ?? [],
        complianceResult,
      })
    )
    .digest("hex");

  if (complianceResult !== "valid") {
    backendState.semantic = "fail";
    return {
      backendState,
      scanIso,
      complianceResult,
      iotaRefs: buildRefs(),
      fingerprint,
      error: "Semantic verification not valid. No anchor operation executed.",
    };
  }
  backendState.semantic = "ok";

  if (skipAnchor) {
    backendState.anchor = "pending";
    return {
      backendState,
      scanIso,
      complianceResult,
      iotaRefs: buildRefs(),
      fingerprint,
    };
  }

  await sleep(STEP_DELAY_MS);
  backendState.anchor = "running";

  const profileId = process.env.CANONICAL_PROFILE_ID ?? profile.anchorProfileId;
  const complianceHash = createHash("sha256")
    .update(
      JSON.stringify({
        bundle_refs: compliance.bundle_refs,
        result: compliance.result,
        profile_id: profileId,
        scan_snapshot_iso: scanIso,
      })
    )
    .digest("hex");

  const adapter = new IotaNotarizationAdapter();

  try {
    const anchor = await withTimeout("IOTA anchor submission", adapter.submitProof({
      subject_ref: subjectRef,
      profile_id: profileId,
      result: true,
      bundle_hash: complianceHash,
    }));

    backendState.anchor = "ok";
    return {
      backendState,
      scanIso,
      complianceResult,
      iotaRefs: buildRefs(),
      fingerprint,
      anchor: {
        network: anchor.network,
        status: anchor.status,
        transactionId: anchor.transaction_id,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    backendState.anchor = "fail";
    return {
      backendState,
      scanIso,
      complianceResult: "reject",
      iotaRefs: buildRefs(),
      fingerprint,
      error: `Anchoring semantic proof failed: ${message}`,
    };
  }
}

async function main(): Promise<void> {
  const profile = await loadScenarioProfile();

  await refreshConnectivity();
  printHeader(profile, { showConnectivity: true });
  await waitForEnter();

  while (true) {
    if (CANONICAL_ALWAYS_ON && !CANONICAL_INTERACTIVE_MENU) {
      const stopCheckingPulse = startCheckingPulse();
      const scanned = await runCanonicalScan(profile, { skipAnchor: true });
      stopCheckingPulse();

      let resultOnline = scanned;
      if (scanned.complianceResult === "valid" && scanned.fingerprint) {
        if (!baselineFingerprint) {
          baselineFingerprint = scanned.fingerprint;
        } else if (baselineFingerprint !== scanned.fingerprint) {
          resultOnline = {
            ...scanned,
            complianceResult: "hold",
            error: "State drift detected vs initial scan baseline.",
          };
        }
      }

      renderOnlineStatus(resultOnline);
      if (ONLINE_CHECK_INTERVAL_MS > 0) {
        const next = await waitForNextAutoCheck(ONLINE_CHECK_INTERVAL_MS);
        if (next === "to_header") {
          clearOnlinePanel();
          baselineFingerprint = null;
          lastOnlineResult = null;
          await refreshConnectivity();
          printHeader(profile, { showConnectivity: true });
          await waitForEnter();
        }
      } else {
        const delay =
          resultOnline.complianceResult === "valid"
            ? Math.max(0, ONLINE_LOOP_OK_DELAY_MS)
            : Math.max(200, ONLINE_LOOP_FAIL_DELAY_MS);
        if (delay > 0) {
          await sleep(delay);
        }
      }
      continue;
    }

    const result = await runCanonicalScan(profile);

    if (result.complianceResult === "reject") {
      await showRejectTerminal(result);
      baselineFingerprint = null;
      lastOnlineResult = null;
      await refreshConnectivity();
      printHeader(profile, { showConnectivity: true });
      await waitForEnter();
      console.log();
      continue;
    }

    printRuntimeResult(result);

    if (CANONICAL_INTERACTIVE_MENU) {
      const action = await showPostScanMenu(result);
      if (action === "exit") {
        process.exit(130);
      }
      if (action === "to_header") {
        baselineFingerprint = null;
        lastOnlineResult = null;
        await refreshConnectivity();
        printHeader(profile, { showConnectivity: true });
        await waitForEnter();
      }
      console.log();
      continue;
    }

    return;
  }
}

void main();
