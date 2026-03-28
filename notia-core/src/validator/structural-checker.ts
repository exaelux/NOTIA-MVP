import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import * as addFormatsNS from "ajv-formats";
import schema from "../../schemas/notia-canonical-event.schema.json" with { type: "json" };
import type { StructuralCheckResult } from "../core/types.js";

const ajv = new Ajv2020({ allErrors: true, strict: false, removeAdditional: false });
const addFormats =
  typeof addFormatsNS === "function"
    ? addFormatsNS
    : (addFormatsNS as unknown as { default: (ajv: Ajv2020) => void }).default;
addFormats(ajv);
const validate = ajv.compile(schema);

export function structuralCheck(event: unknown): StructuralCheckResult {
  const isValid = validate(event);

  if (!isValid) {
    return {
      status: "fail",
      errors:
        validate.errors?.map(
          (e: ErrorObject) => `${e.instancePath} ${e.message}`,
        ) ?? [],
    };
  }

  return { status: "pass" };
}
