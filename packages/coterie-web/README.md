# coterie-web

The web dashboard for [Coterie](https://github.com/cxk280/coterie). Built on
**Next.js 15** (App Router) + **Tailwind CSS v4** + **React 19**. Tokens mirror
the [Figma design file](https://www.figma.com/design/EYBMgxiSo24ymGh066uy3z)
and `schemas/coterie.config.schema.json`.

## Status

Full dashboard + real backend. Pages fetch from [`coterie-api`](../coterie-api)
when reachable and fall back to mock fixtures (`lib/mock-data.ts`) when it's
down, so the design is always demoable.

Implemented:

- `/` — dashboard / new run (5-mode picker, agent cards, advanced config,
  Run button posts to `/api/runs`)
- `/runs` — paginated run history
- `/runs/[id]` — completed-run detail (timeline, cost bars, final state)
- `/runs/[id]/live` — live SSE-driven run view; per-mode visualization
  (adversarial / consensus / debate / single / tournament) that builds up
  from `state` events; HIL modal overlays when the run pauses at a checkpoint
- `/agents` — adapter registry (live from `/api/agents` with mock metadata
  overlay)
- `/settings` — provider keys
- `/states/[name]` — error state demos rendered via the reusable `ErrorState`
  component (first-run, missing-key, budget-exceeded, all-agents-failed)
- `/runs/new/[mode]` — static demo live views for design review

## Local dev

```bash
cd packages/coterie-web
npm install
npm run dev    # → http://localhost:3000
```

With the API server running (`coterie-api --reload` in another terminal),
clicking Run on the dashboard POSTs to `/api/runs` and redirects to the live
view. Without the server, the dashboard's Run button degrades to the static
mock route.

## Env

| Var | Default | Effect |
|---|---|---|
| `NEXT_PUBLIC_COTERIE_API_URL` | `http://127.0.0.1:8000` | Backend base URL |
| `COTERIE_API_TOKEN` | _(none)_ | Bearer token sent on every request |
| `NEXT_PUBLIC_COTERIE_API_TOKEN` | _(none)_ | Browser-visible token (dev only — use server-side var in production) |

When the API is on localhost and `COTERIE_API_ALLOW_LOCALHOST=1` on the server
side (default), no token is required and these can be left unset.

## Architecture

- `app/` — App Router pages (server components by default).
- `components/ui/` — primitives reused across pages: `Header`, `AppNav`,
  `ModeBadge`, `StatusPill`, `SpendChip`, `Button`, `ErrorState`, `HilModal`,
  `ApiUnreachableBanner`.
- `components/dashboard/` — dashboard composites including the client-side
  `RunButton` that POSTs to the API.
- `components/modes/<mode>/` — two flavors per mode:
  - `<Mode>View.tsx` — original static demo bound to mock-data
  - `<Mode>LiveView.tsx` — live version that takes `LiveBodyProps` and
    renders from the streamed state
- `components/runs/LiveRunView.tsx` — dispatches by mode + mounts the
  `HilModal` when paused.
- `lib/api.ts` — fetch wrappers, EventSource URL helper, bearer-token reader.
- `lib/live-state.ts` — `useLiveRunState` hook (event-driven reducer over a
  reusable `LiveState` shape).
- `lib/live-types.ts` — shared `LiveBodyProps` interface (broken out of
  LiveRunView to avoid the import cycle).
- `lib/mock-data.ts` — static fixtures used when the API is unreachable.
- `app/globals.css` — design tokens defined as `@theme` CSS variables.
