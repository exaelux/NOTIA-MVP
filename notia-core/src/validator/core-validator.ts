import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import * as addFormatsNS from "ajv-formats";
import schema from "../../schemas/noema-core-pure.schema.json" with { type: "json" };

const ajv = new Ajv2020({ allErrors: true, strict: false, removeAdditional: false });
const addFormats =
  typeof addFormatsNS === "function"
    ? addFormatsNS
    : (addFormatsNS as unknown as { default: (ajv: Ajv2020) => void }).default;
addFormats(ajv);
const validate = ajv.compile(schema);

function extractCorePayload(bundle: unknown): unknown {
  if (bundle === null || typeof bundle !== "object") {
    return bundle;
  }

  const record = bundle as Record<string, unknown>;
  return {
    existence: record.existence,
    meaning: record.meaning,
    visibility_abstract: record.visibility_abstract,
  };
}

export function validateCoreBundle(
  bundle: unknown,
): { valid: boolean; errors?: string[] } {
  const corePayload = extractCorePayload(bundle);
  const isValid = validate(corePayload);

  if (!isValid) {
    return {
      valid: false,
      errors:
        validate.errors?.map(
          (e: ErrorObject) => `${e.instancePath} ${e.message}`,
        ) ?? [],
    };
  }

  return { valid: true };
}
