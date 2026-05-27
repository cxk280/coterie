/** Pre-run validation of a resolved config: catch the structural problems that
 *  would otherwise blow up deep inside a graph node (missing agent ids, empty
 *  participant lists, malformed debate sides) and surface them as one clear,
 *  upfront error instead. Schema validation (config.ts) covers shape; this covers
 *  cross-references between sections and the agent lineup. */

export function validateRuntimeConfig(cfg: any): void {
  const agents: any[] = Array.isArray(cfg?.agents) ? cfg.agents : [];
  if (agents.length === 0) {
    throw new Error("Invalid config: 'agents' must list at least one agent.");
  }
  const ids = new Set(agents.map((a) => a?.id).filter(Boolean));
  const known = [...ids].join(", ");
  const need = (id: unknown, label: string) => {
    if (typeof id !== "string" || !ids.has(id)) {
      throw new Error(`Invalid config: ${label} '${id ?? ""}' is not one of the configured agents (${known}).`);
    }
  };

  switch (cfg.mode) {
    case "adversarial": {
      const a = cfg.adversarial ?? {};
      need(a.implementer, "adversarial.implementer");
      need(a.auditor, "adversarial.auditor");
      break;
    }
    case "debate": {
      const sides = cfg.debate?.sides;
      if (!Array.isArray(sides) || sides.length !== 2) {
        throw new Error("Invalid config: debate.sides must list exactly two agent ids.");
      }
      need(sides[0], "debate.sides[0]");
      need(sides[1], "debate.sides[1]");
      break;
    }
    case "consensus":
    case "tournament": {
      const p: unknown = cfg[cfg.mode]?.participants ?? agents.map((a) => a.id);
      if (!Array.isArray(p) || p.length < 2) {
        throw new Error(`Invalid config: ${cfg.mode} needs at least two participants.`);
      }
      for (const id of p) need(id, `${cfg.mode}.participants`);
      break;
    }
    // single: the supervisor routes among `agents` (already non-empty).
  }
}
