/**
 * Terminal bridge: a tiny WebSocket server that spawns `coterie chat` in a PTY
 * and pipes it to the browser's xterm.js. Run it alongside the web app:
 *
 *   npm run terminal:bridge          # ws://localhost:3051
 *
 * It's deliberately separate from the Next app so the native `node-pty`
 * dependency never enters the web build or CI. Configure via env:
 *   COTERIE_TERMINAL_PORT (3051), COTERIE_TERMINAL_WORKDIR (cwd),
 *   COTERIE_TERMINAL_MODE (adversarial), COTERIE_CHAT_CMD (built CLI path).
 *
 * Wire protocol (client → server): first byte tags the frame —
 *   "0" + data        raw keystrokes
 *   "1" + "cols,rows" resize
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pty from "@homebridge/node-pty-prebuilt-multiarch";
import { WebSocketServer } from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.COTERIE_TERMINAL_PORT ?? 3051);
const WORKDIR = process.env.COTERIE_TERMINAL_WORKDIR ?? process.cwd();
const MODE = process.env.COTERIE_TERMINAL_MODE ?? "adversarial";
const CLI = process.env.COTERIE_CHAT_CMD ?? resolve(__dirname, "../../coterie-js/dist/cli.js");

const wss = new WebSocketServer({ port: PORT });
console.log(`coterie terminal bridge → ws://localhost:${PORT}  (mode=${MODE}, workdir=${WORKDIR})`);

const WS_OPEN = 1; // WebSocket.OPEN

wss.on("connection", (ws) => {
  console.log(`client connected → spawning: ${process.execPath} ${CLI} chat --mode ${MODE}`);
  let term;
  try {
    term = pty.spawn(process.execPath, [CLI, "chat", "--mode", MODE, "--workdir", WORKDIR], {
      name: "xterm-color",
      cols: 80,
      rows: 24,
      cwd: WORKDIR,
      env: process.env,
    });
  } catch (e) {
    console.error("pty.spawn failed:", e);
    if (ws.readyState === WS_OPEN) ws.send(`\r\nfailed to start coterie chat: ${e.message}\r\n`);
    ws.close();
    return;
  }

  term.onData((data) => {
    if (ws.readyState === WS_OPEN) ws.send(data);
  });
  term.onExit(({ exitCode }) => {
    console.log(`coterie chat exited (code ${exitCode})`);
    if (ws.readyState === WS_OPEN) ws.close();
  });

  ws.on("message", (raw) => {
    const msg = raw.toString();
    const tag = msg[0];
    const body = msg.slice(1);
    if (tag === "1") {
      const [cols, rows] = body.split(",").map(Number);
      if (cols > 0 && rows > 0) term.resize(cols, rows);
    } else {
      term.write(body);
    }
  });

  ws.on("close", () => term.kill());
});
