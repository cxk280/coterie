"use client";

import { useState } from "react";

import { MODE_LIST, MODES, type Mode } from "@/lib/modes";

interface ModeGridProps {
  defaultMode?: Mode;
  onChange?: (mode: Mode) => void;
}

export function ModeGrid({ defaultMode = "adversarial", onChange }: ModeGridProps) {
  const [selected, setSelected] = useState<Mode>(defaultMode);

  const pick = (m: Mode) => {
    setSelected(m);
    onChange?.(m);
  };

  return (
    <div className="grid grid-cols-5 gap-3">
      {MODE_LIST.map((id) => {
        const meta = MODES[id];
        const isActive = id === selected;
        return (
          <button
            key={id}
            type="button"
            onClick={() => pick(id)}
            className="flex flex-col gap-2 rounded-lg border px-3.5 py-3.5 text-left transition hover:opacity-90"
            style={{
              background: isActive ? "var(--color-bg-raised)" : "var(--color-bg-surface)",
              borderColor: isActive
                ? `var(${meta.colorVar})`
                : "var(--color-border-default)",
              borderWidth: isActive ? "2px" : "1px",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-base" style={{ color: `var(${meta.colorVar})` }}>
                {meta.glyph}
              </span>
              <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {meta.title}
              </span>
            </div>
            <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
              {meta.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
