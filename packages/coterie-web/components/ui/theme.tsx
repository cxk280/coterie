"use client";

import { ThemeProvider as NextThemeProvider, useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}

/** Dark/light toggle. Renders empty until mounted so SSR markup matches the
 *  client (the resolved theme is only known in the browser). */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isLight = resolvedTheme === "light";
  const next = isLight ? "dark" : "light";

  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => setTheme(next)}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition hover:opacity-80 ${className ?? ""}`}
      style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)" }}
    >
      {mounted ? (isLight ? "☾" : "☀") : null}
    </button>
  );
}
