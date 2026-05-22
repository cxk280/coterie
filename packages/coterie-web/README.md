# coterie-web

The web dashboard for [Coterie](https://github.com/cxk280/coterie) — multi-mode LangGraph
orchestration for heterogeneous coding agents.

Built on **Next.js 15** (App Router) + **Tailwind CSS v4** + **React 19**. Tokens mirror the
[Figma design file](https://www.figma.com/design/EYBMgxiSo24ymGh066uy3z) and
`schemas/coterie.config.schema.json`.

## Status

**v0.1 — static UI shell.** Screens render from `lib/mock-data.ts`. There's no backend yet —
the next iteration wires this to a thin HTTP server in front of the Python `coterie` graph
runner.

Implemented screens:

- `/` — Dashboard / new run (task input, mode picker, agent cards, advanced config)
- `/runs/new/adversarial` — Live run view (3-column layout: implementer · auditor · inspector)

Other modes (`single`, `consensus`, `debate`, `tournament`) and the run history / detail /
settings / agent registry pages all have Figma mocks; the routes exist as stubs.

## Local dev

```bash
cd packages/coterie-web
npm install
npm run dev
# → http://localhost:3000
```

## Architecture

- `app/` — Next.js App Router pages (server components by default).
- `components/ui/` — primitives reused across pages (`Header`, `ModeBadge`, `StatusPill`,
  `SpendChip`, `Button`, `ErrorState`).
- `components/dashboard/` — dashboard-specific composites.
- `components/modes/<mode>/` — per-mode live view composites.
- `lib/` — `modes.ts` (Mode metadata), `types.ts` (mirrors Python's `CoterieState`),
  `mock-data.ts` (static fixtures).
- `app/globals.css` — design tokens defined as `@theme` CSS variables.

## Design tokens

All colors come from CSS variables. Use them like `style={{ color: "var(--color-text-primary)" }}`
or via the Tailwind `@theme` extension. No hardcoded hex values in components.

The token names mirror the Figma variable collection one-for-one. If you add a token, add it
to **both** `app/globals.css` and the Figma `Coterie Tokens` collection.
