"use client";

import "@xterm/xterm/css/xterm.css";

import { useEffect, useRef, useState } from "react";

import { AppNav } from "@/components/ui/AppNav";

const PORT = process.env.NEXT_PUBLIC_COTERIE_TERMINAL_PORT ?? "3051";

export default function TerminalPage() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"connecting" | "open" | "closed">("connecting");

  useEffect(() => {
    let dispose = () => {};
    let cancelled = false;

    (async () => {
      // Loaded client-side only — xterm touches window/document, so it must
      // never run during SSR or the Next build.
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      if (cancelled || !host.current) return;

      const term = new Terminal({
        convertEol: true,
        fontFamily: "var(--font-jetbrains-mono), monospace",
        fontSize: 13,
        theme: { background: "#0a0b0d", foreground: "#f0f1f3" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host.current);
      fit.fit();

      const ws = new WebSocket(`ws://localhost:${PORT}`);
      ws.binaryType = "arraybuffer";
      const sendResize = () => ws.readyState === ws.OPEN && ws.send(`1${term.cols},${term.rows}`);

      ws.onopen = () => { setStatus("open"); fit.fit(); sendResize(); };
      ws.onclose = () => setStatus("closed");
      ws.onerror = () => setStatus("closed");
      ws.onmessage = (e) =>
        term.write(typeof e.data === "string" ? e.data : new Uint8Array(e.data as ArrayBuffer));

      term.onData((d) => ws.readyState === ws.OPEN && ws.send(`0${d}`));
      term.onResize(sendResize);

      const onWin = () => fit.fit();
      window.addEventListener("resize", onWin);
      dispose = () => {
        window.removeEventListener("resize", onWin);
        ws.close();
        term.dispose();
      };
    })();

    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <AppNav active="runs" />
      <div className="flex items-center gap-2 px-4 py-2" style={{ background: "var(--color-bg-surface)", borderBottom: "1px solid var(--color-border-subtle)" }}>
        <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
          coterie chat
        </span>
        <span
          className="font-mono text-[11px]"
          style={{
            color:
              status === "open"
                ? "var(--color-status-success)"
                : status === "connecting"
                ? "var(--color-status-warning)"
                : "var(--color-status-error)",
          }}
        >
          ● {status}
        </span>
        {status !== "open" && (
          <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            — start the bridge: <code className="font-mono">npm run terminal:bridge</code>
          </span>
        )}
      </div>
      <div ref={host} className="flex-1 overflow-hidden p-2" style={{ background: "#0a0b0d" }} />
    </div>
  );
}
