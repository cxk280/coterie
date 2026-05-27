/** Process-wide progress bus for live agent activity. The graph nodes emit
 *  `start`/`done` as each agent runs; a front-end (the chat REPL, `coterie run`)
 *  subscribes to stream the back-and-forth live. Decoupled from LangGraph's
 *  superstep batching so fan-out (e.g. consensus) still logs each agent as it
 *  finishes. Harmless when nobody is listening. */

import { EventEmitter } from "node:events";

import type { AgentRun } from "./state.js";

export interface AgentStartEvent {
  agent_id: string;
  role: string;
}

export interface AgentDoneEvent {
  run: AgentRun;
}

/** A live activity line from inside an agent's run (a tool call, a command, a
 *  file edit) — emitted as the agent streams, before it finishes. */
export interface AgentStepEvent {
  agent_id: string;
  role: string;
  text: string;
}

class ProgressBus extends EventEmitter {
  start(ev: AgentStartEvent): void {
    this.emit("start", ev);
  }
  done(ev: AgentDoneEvent): void {
    this.emit("done", ev);
  }
  step(ev: AgentStepEvent): void {
    this.emit("step", ev);
  }
}

// A single shared bus for the process. Bump the listener ceiling: a turn can run
// several agents and we add a per-turn subscriber, so the default of 10 is tight.
export const progress = new ProgressBus();
progress.setMaxListeners(64);
