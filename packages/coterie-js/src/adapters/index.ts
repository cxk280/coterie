/** Importing this module triggers all built-in adapter registrations. */

import "./claudeCode.js";
import "./codex.js";
import "./cursor.js";
import "./fake.js";

export { CLIAdapter, type AdapterResult, type CLIAdapterCtor } from "./base.js";
export { ClaudeCodeAdapter } from "./claudeCode.js";
export { CodexAdapter } from "./codex.js";
export { CursorAdapter } from "./cursor.js";
export { FakeAdapter, FakeAdapterError } from "./fake.js";
