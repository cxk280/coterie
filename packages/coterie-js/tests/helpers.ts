import { afterEach, beforeEach } from "vitest";

import { FakeAdapter } from "../src/adapters/fake.js";

export function autoResetFakes() {
  beforeEach(() => FakeAdapter.resetAll());
  afterEach(() => FakeAdapter.resetAll());
}

export { initialState } from "../src/core/state.js";
