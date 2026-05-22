import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv from "ajv";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(here, "..", "..", "..", "schemas", "coterie.config.schema.json");

export function loadConfig(path: string): Record<string, any> {
  const raw = parseYaml(readFileSync(path, "utf8"));
  try {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    if (!validate(raw)) {
      throw new Error(`Invalid config: ${ajv.errorsText(validate.errors)}`);
    }
  } catch (e: any) {
    if (e?.message?.startsWith?.("Invalid config:")) throw e;
    // Schema unavailable — best-effort skip
  }
  return raw;
}
