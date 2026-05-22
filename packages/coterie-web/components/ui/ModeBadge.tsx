import { MODES, type Mode } from "@/lib/modes";

interface ModeBadgeProps {
  mode: Mode;
  size?: "sm" | "md";
}

export function ModeBadge({ mode, size = "md" }: ModeBadgeProps) {
  const meta = MODES[mode];
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2.5 py-1.5";
  const fontSize = size === "sm" ? "text-[10px]" : "text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-mono font-bold ${padding} ${fontSize}`}
      style={{
        background: `var(${meta.colorVar})`,
        color: "#000",
      }}
    >
      <span className="font-normal">{meta.glyph}</span>
      {meta.title}
    </span>
  );
}
