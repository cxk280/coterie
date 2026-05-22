/** Shared graph compilation. Mirrors Python `core/compile.py`. */

import { MemorySaver } from "@langchain/langgraph";

export function compileWithInterrupts(builder: any, config: Record<string, any>): any {
  const cps = (config.checkpoints ?? {}) as Record<string, boolean>;
  const interrupts = Object.entries(cps)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
  if (interrupts.length === 0) {
    return builder.compile();
  }
  return builder.compile({
    checkpointer: new MemorySaver(),
    interruptBefore: interrupts,
  });
}
