/**
 * Minimal smoke check: build the graph without invoking the real CLI.
 * Run with: npx tsx examples/01_single_agent.ts
 */
import { buildGraph } from "../src/graph.js";

const graph = buildGraph({ agentId: "claude", adapterKind: "claude-code", workdir: "." });
console.log("graph compiled:", graph);
