import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export interface ScenarioProfile {
  id: string;
  label: string;
  networkLabel: string;
  runtimeVersion: string;
  eventSource?: "onchain" | "file";
  anchorProfileId: string;
  subjectRef: string;
  eventsPath?: string;
  vehicleCertificateObjectId: string;
  cargoManifestObjectId: string;
  identityNameObjectUrl?: string;
  companyNameObjectUrl?: string;
}

const DEFAULT_BORDERTEST_PROFILE: ScenarioProfile = {
  id: "bordertest",
  label: "Scenario",
  networkLabel: "IOTA",
  runtimeVersion: "v0.1",
  eventSource: "onchain",
  anchorProfileId: "bordertest-v1",
  subjectRef: "subject:entity:sample-001",
  eventsPath: "events/bordertest.json",
  vehicleCertificateObjectId: "",
  cargoManifestObjectId: "",
};

function runtimeBaseDir(): string {
  return process.env.NCR_ENGINE_HOME ?? process.cwd();
}

export function resolveProfilePath(pathLike: string): string {
  if (isAbsolute(pathLike)) {
    return pathLike;
  }
  return resolve(runtimeBaseDir(), pathLike);
}

async function loadProfileFromFile(filePath: string, requestedId: string): Promise<ScenarioProfile> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<ScenarioProfile>;

  const merged: ScenarioProfile = {
    ...DEFAULT_BORDERTEST_PROFILE,
    ...parsed,
    id: parsed.id ?? requestedId,
  };

  const required: Array<keyof ScenarioProfile> = [
    "id",
    "label",
    "networkLabel",
    "runtimeVersion",
    "anchorProfileId",
    "subjectRef",
    "vehicleCertificateObjectId",
    "cargoManifestObjectId",
  ];

  for (const key of required) {
    if (typeof merged[key] !== "string" || merged[key] === "") {
      throw new Error(`Invalid scenario profile (${filePath}): missing "${key}"`);
    }
  }

  const eventSource = merged.eventSource ?? "onchain";
  if (eventSource !== "onchain" && eventSource !== "file") {
    throw new Error(
      `Invalid scenario profile (${filePath}): eventSource must be "onchain" or "file"`
    );
  }
  if (eventSource === "file" && (!merged.eventsPath || merged.eventsPath.trim() === "")) {
    throw new Error(
      `Invalid scenario profile (${filePath}): "eventsPath" is required when eventSource is "file"`
    );
  }
  merged.eventSource = eventSource;

  return merged;
}

export async function loadScenarioProfile(profileId?: string): Promise<ScenarioProfile> {
  const requested = profileId ?? process.env.NCR_PROFILE ?? "bordertest";
  const candidates: string[] = [];

  if (process.env.NCR_PROFILE_FILE) {
    candidates.push(resolveProfilePath(process.env.NCR_PROFILE_FILE));
  }

  if (requested.endsWith(".json") || requested.includes("/")) {
    candidates.push(resolveProfilePath(requested));
  }

  candidates.push(resolve(runtimeBaseDir(), "profiles", `${requested}.json`));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return loadProfileFromFile(candidate, requested);
    }
  }

  if (requested === "bordertest") {
    return DEFAULT_BORDERTEST_PROFILE;
  }

  throw new Error(
    `Scenario profile "${requested}" not found. Searched: ${candidates.join(", ")}`
  );
}
