/** Mode dispatcher. */

import { MODE_REGISTRY } from "./core/registry.js";
import type { ModeBuildOpts } from "./core/types.js";

export function buildGraph(opts: ModeBuildOpts) {
  const mode = opts.config.mode;
  if (!mode) {
    throw new Error(`config.mode is required; expected one of ${MODE_REGISTRY.names().join(", ")}`);
  }
  const builder = MODE_REGISTRY.get(mode);
  if (!builder) {
    throw new Error(`unknown mode ${mode}; available: ${MODE_REGISTRY.names().join(", ")}`);
  }
  return builder(opts);
}
