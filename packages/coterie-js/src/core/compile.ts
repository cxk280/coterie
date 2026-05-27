/** Shared graph compilation. */

// NOTE: the prior checkpointer + interruptBefore path (audit #23) was removed —
// it required a `configurable.thread_id` at stream/invoke time (never passed) and
// there was no resume path, so the interrupt/`awaiting_human` flow was unusable.
// Budget halts now surface as a terminal status instead (the finalizer is skipped).
export function compileGraph(builder: any, _config: Record<string, any>): any {
  return builder.compile();
}
