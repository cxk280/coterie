import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
// Schema ships inside the package (../schemas relative to both src/ and dist/),
// so config validation works for npm installs, not just the source checkout.
const SCHEMA_PATH = resolve(here, "..", "schemas", "coterie.config.schema.json");

export function loadConfig(path: string): Record<string, any> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e: any) {
    if (e?.code === "ENOENT") throw new Error(`Config file not found: ${path}`);
    throw e;
  }
  const raw = parseYaml(text);
  try {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
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
