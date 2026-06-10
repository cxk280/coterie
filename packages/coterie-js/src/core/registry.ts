/**
 * Pluggable registries for adapters and modes. Concrete modules register
 * themselves at module load (importing adapters/index.js or modes/index.js
 * triggers all built-ins); graph.ts and the agent runner resolve by name.
 */

export class AlreadyRegisteredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlreadyRegisteredError";
  }
}

export class Registry<T> {
  private items = new Map<string, T>();

  constructor(public readonly kind: string) {}

  register(name: string, item: T): T {
    if (!name) throw new Error(`${this.kind} must have a non-empty name`);
    if (this.items.has(name)) {
      throw new AlreadyRegisteredError(
        `${this.kind} ${name} is already registered`,
      );
    }
    this.items.set(name, item);
    return item;
  }

  get(name: string): T | undefined {
    return this.items.get(name);
  }

  require(name: string): T {
    const item = this.items.get(name);
    if (item === undefined) {
      throw new Error(
        `${this.kind} ${name} is not registered; known: ${this.names().join(", ")}`,
      );
    }
    return item;
  }

  names(): string[] {
    return [...this.items.keys()];
  }

  has(name: string): boolean {
    return this.items.has(name);
  }

  /** Test helper. Wipes the registry. */
  reset(): void {
    this.items.clear();
  }
}

import type { CLIAdapterCtor } from "../adapters/base.js";
import type { ModeBuilder } from "./types.js";

export const ADAPTER_REGISTRY = new Registry<CLIAdapterCtor>("adapter");
export const MODE_REGISTRY = new Registry<ModeBuilder>("mode");

export function registerAdapter(ctor: CLIAdapterCtor): CLIAdapterCtor {
  if (!ctor.adapterName) {
    throw new Error(
      `${ctor.name} must declare a static \`adapterName: string\` to be registered`,
    );
  }
  ADAPTER_REGISTRY.register(ctor.adapterName, ctor);
  return ctor;
}

export function registerMode(name: string, builder: ModeBuilder): ModeBuilder {
  MODE_REGISTRY.register(name, builder);
  return builder;
}
