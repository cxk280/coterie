/**
 * Mode metadata. Mirrors `src/coterie/core/state.py` Mode type and the schema
 * at `schemas/coterie.config.schema.json`.
 */

export type Mode = "single" | "consensus" | "adversarial" | "debate" | "tournament";

export interface ModeMeta {
  id: Mode;
  glyph: string;
  title: string;
  description: string;
  /** CSS variable name — pair with `style={{ background: \`var(--color-mode-${id})\` }}` */
  colorVar: `--color-mode-${Mode}`;
}

export const MODES: Record<Mode, ModeMeta> = {
  single: {
    id: "single",
    glyph: "→",
    title: "single",
    description: "supervisor routes one agent per subtask",
    colorVar: "--color-mode-single",
  },
  consensus: {
    id: "consensus",
    glyph: "≡",
    title: "consensus",
    description: "N agents independently report; engine scores agreement",
    colorVar: "--color-mode-consensus",
  },
  adversarial: {
    id: "adversarial",
    glyph: "⚔",
    title: "adversarial",
    description: "implementer + auditor + judge; iterative refinement",
    colorVar: "--color-mode-adversarial",
  },
  debate: {
    id: "debate",
    glyph: "⇄",
    title: "debate",
    description: "pro + con + moderator across N rounds; judge picks",
    colorVar: "--color-mode-debate",
  },
  tournament: {
    id: "tournament",
    glyph: "♛",
    title: "tournament",
    description: "N participants race; bracket judge ranks; winner advances",
    colorVar: "--color-mode-tournament",
  },
};

export const MODE_LIST: Mode[] = ["single", "consensus", "adversarial", "debate", "tournament"];
