/** Types shared between the live state hook and per-mode view components. Lives in
 * its own file to avoid the circular dep between LiveRunView → mode views → LiveRunView. */

import type { ApiRunDetail } from "./api";
import type { LiveEvent, LiveState } from "./live-state";

export interface LiveBodyProps {
  state: LiveState;
  runId: string;
  initial: ApiRunDetail;
  events: LiveEvent[];
}
