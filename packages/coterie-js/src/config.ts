/** Loads and schema-validates a coterie.yaml config for `coterie run`. (The chat
 *  REPL doesn't read config files — it builds defaults via chat/configs.ts.)
 *  Cross-reference checks live in core/validate.ts; this covers file + shape. */

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

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (e: any) {
    throw new Error(`Invalid YAML in ${path}: ${e?.message ?? String(e)}`);
  }
  if (raw === null || raw === undefined) {
    throw new Error(`Config file is empty: ${path}`);
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid config: ${path} must contain a YAML mapping (key: value) at the top level`);
  }

  // Validate against the bundled schema. Only a *missing* schema file is skipped
  // (a partial/broken install); a schema that loads MUST run, so genuine config
  // errors always surface rather than being silently swallowed.
  let schemaText: string | null = null;
  try {
    schemaText = readFileSync(SCHEMA_PATH, "utf8");
  } catch {
    schemaText = null;
  }
  if (schemaText) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(JSON.parse(schemaText));
    if (!validate(raw)) {
      throw new Error(`Invalid config: ${ajv.errorsText(validate.errors)}`);
    }
  }
  return raw as Record<string, any>;
}
