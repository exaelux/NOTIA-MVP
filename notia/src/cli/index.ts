import { readFile } from "node:fs/promises";
import type { CanonicalEvent } from "@notia/core";
import { runNotia } from "@notia/core";
import { IotaAnchorAdapter } from "../iota/anchor.js";

type CliOptions = {
  filePath: string;
  verbose: boolean;
  anchor: boolean;
  previousBundleRef?: string;
  help?: boolean;
};

const BUNDLE_REF_HEX_REGEX = /^[a-f0-9]{64}$/;
const BUNDLE_REF_URI_REGEX = /^noema:bundle:sha256:([a-f0-9]{64})$/;

function normalizePreviousBundleRef(value: string): string | null {
  const trimmed = value.trim();
  if (BUNDLE_REF_HEX_REGEX.test(trimmed)) {
    return trimmed;
  }

  const uriMatch = trimmed.match(BUNDLE_REF_URI_REGEX);
  if (uriMatch && uriMatch[1]) {
    return uriMatch[1];
  }

  return null;
}

function parseArgs(argv: string[]): CliOptions | null {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("NOTIA CLI - Deterministic Semantic Interpreter");
    console.log("Usage: notia <path-to-json> [options]");
    console.log("");
    console.log("Options:");
    console.log("--verbose Show full bundle output (JSON)");
    console.log("--previous-bundle-ref=REF Chain from previous bundle");
    console.log("--anchor Submit each semantic bundle hash to the configured IOTA anchor package");
    console.log("--help, -h Show this help message");
    process.exitCode = 0;
    return { filePath: "", verbose: false, anchor: false, help: true };
  }

  const filePath = argv[2];
  if (!filePath) {
    console.error("Error: Missing input file.");
    console.error("Usage: npm run notia <path-to-json> [options]");
    console.error("Example:");
    console.error("  npm run notia events.json --verbose");
    console.error("  npm run notia batch.json --previous-bundle-ref=noema:bundle:sha256:...");
    process.exitCode = 1;
    return null;
  }

  let verbose = false;
  let anchor = false;
  let previousBundleRef: string | undefined;

  for (const arg of argv.slice(3)) {
    if (arg === "--verbose") {
      verbose = true;
      continue;
    }
    if (arg === "--anchor") {
      anchor = true;
      continue;
    }

    if (arg.startsWith("--previous-bundle-ref=")) {
      const value = arg.slice("--previous-bundle-ref=".length).trim();
      if (!value) {
        console.error("Invalid --previous-bundle-ref value.");
        process.exitCode = 1;
        return null;
      }
      const normalized = normalizePreviousBundleRef(value);
      if (!normalized) {
        console.error(
          "Invalid --previous-bundle-ref format. Expected 64-char hex or noema:bundle:sha256:<64-char-hex>.",
        );
        process.exitCode = 1;
        return null;
      }
      previousBundleRef = normalized;
      continue;
    }

    console.error(`Unknown argument: ${arg}`);
    process.exitCode = 1;
    return null;
  }

  return {
    filePath,
    verbose,
    anchor,
    ...(previousBundleRef ? { previousBundleRef } : {}),
  };
}

function printFailure(index: number, kind: "structural_fail" | "core_schema_fail", errors?: string[]): void {
  console.error(`[${index}] ${kind}`);
  if (errors && errors.length > 0) {
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
  } else {
    console.error("  - No validation errors were provided.");
  }
}

function printSuccess(
  index: number,
  bundle: {
    meaning: {
      bundle_ref: string;
      aggregated_state: string;
    };
  },
  verbose: boolean,
): void {
  if (verbose) {
    console.log(`[${index}] semantic_bundle -> ${bundle.meaning.aggregated_state}`);
    console.log(JSON.stringify(bundle, null, 2));
  } else {
    console.log(
      `[${index}] ${bundle.meaning.aggregated_state.toUpperCase()} | bundle_ref: ${bundle.meaning.bundle_ref}`,
    );
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  if (!options) {
    return;
  }
  if (options.help) {
    return;
  }

  let raw: string;
  if (options.filePath === "-") {
    raw = await new Promise<string>((resolve, reject) => {
      let data = "";
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data));
      process.stdin.on("error", reject);
    });
  } else {
    try {
      raw = await readFile(options.filePath, "utf8");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown file read error.";
      console.error(`Failed to read file: ${message}`);
      process.exitCode = 1;
      return;
    }
  }

  if (!raw.trim()) {
    console.error("Input file is empty.");
    process.exitCode = 1;
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error.";
    console.error(`Invalid JSON: ${message}`);
    process.exitCode = 1;
    return;
  }

  const events: CanonicalEvent[] = Array.isArray(parsed)
    ? (parsed as CanonicalEvent[])
    : [parsed as CanonicalEvent];

  if (events.length === 0) {
    console.error("Input JSON array is empty.");
    process.exitCode = 1;
    return;
  }

  let previousBundleRef = options.previousBundleRef;
  const anchorAdapter = options.anchor ? new IotaAnchorAdapter() : null;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const index = i + 1;
    if (!event) {
      console.error(`[${index}] Missing event at index ${i}.`);
      process.exitCode = 1;
      return;
    }

    const result = previousBundleRef
      ? runNotia(event, { previous_bundle_ref: previousBundleRef })
      : runNotia(event);

    if (result.type === "structural_fail") {
      printFailure(index, "structural_fail", result.errors);
      process.exitCode = 1;
      return;
    }

    if (result.type === "core_schema_fail") {
      printFailure(index, "core_schema_fail", result.errors);
      process.exitCode = 2;
      return;
    }

    printSuccess(index, result.bundle, options.verbose);
    if (anchorAdapter) {
      const anchor = await anchorAdapter.anchor(result.bundle);
      if (options.verbose) {
        console.log(JSON.stringify(anchor, null, 2));
      } else {
        console.log(
          `ANCHOR -> ${anchor.network} | tx_id: ${anchor.transaction_id} | ${anchor.status}`,
        );
      }
    }
    previousBundleRef = result.bundle.meaning.bundle_ref;
  }

  process.exitCode = 0;
}

void main();
