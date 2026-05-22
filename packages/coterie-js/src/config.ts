import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import Ajv from "ajv";
import { parse as parseYaml } from "yaml";

export interface AgentConfig {
  id: string;
  adapter: "claude-code" | "codex" | "cursor" | "aider" | "shell";
  command?: string[];
  model?: string;
  strengths?: string[];
  timeout_s?: number;
}

export interface CoterieConfig {
  version?: number;
  agents: AgentConfig[];
  router?: {
    enabled?: boolean;
    model?: string;
    strategy?: "llm" | "round-robin" | "manual";
  };
  fanout?: {
    enabled?: boolean;
    pair?: [string, string];
    judge?: { model?: string; criteria?: string[] };
  };
  checkpoints?: Record<string, boolean>;
  budget?: {
    max_usd_per_task?: number;
    warn_at_usd?: number;
    on_exceed?: "halt" | "warn" | "checkpoint";
  };
  tools?: Array<{ id: string; kind: string; args?: string[] }>;
  observability?: { provider?: string; log_dir?: string };
  workdir?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(here, "..", "..", "..", "..", "schemas", "coterie.config.schema.json");

export function loadConfig(path: string): CoterieConfig {
  const raw = parseYaml(readFileSync(path, "utf8")) as CoterieConfig;
  try {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    if (!validate(raw)) {
      throw new Error(
        `Invalid config: ${ajv.errorsText(validate.errors, { separator: "; " })}`,
      );
    }
  } catch (err) {
    // Schema is best-effort during local dev; rethrow validation errors,
    // ignore missing-file errors.
    if (err instanceof Error && !err.message.startsWith("Invalid config")) {
      // fall through — schema not present yet
    } else {
      throw err;
    }
  }
  return raw;
}
