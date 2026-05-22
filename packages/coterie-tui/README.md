# coterie-tui

Rich-based TUI client for the [coterie-api](../coterie-api) server. Same
authentication, same data shape, same SSE stream — just rendered in a terminal.

## Install

```bash
pip install -e packages/coterie-tui
```

## Usage

```
coterie-tui list                            # paginated run history
coterie-tui list --mode adversarial         # filter
coterie-tui show <run-id>                   # summary + agent runs + judge decisions
coterie-tui watch <run-id>                  # stream SSE events live
coterie-tui run "Refactor src/auth.ts" \    # create + stream
              --mode adversarial \
              --config examples/adversarial.yaml
coterie-tui resume <run-id>                 # approve at an HIL checkpoint
coterie-tui resume <run-id> --reject
coterie-tui delete <run-id>
coterie-tui me                              # show the authenticated user
```

## Auth

Same env vars as `coterie-web`:

| Var | Default | Effect |
|---|---|---|
| `COTERIE_API_URL` | `http://127.0.0.1:8000` | Backend base URL |
| `COTERIE_API_TOKEN` | _(none)_ | Bearer token sent on every request |

Localhost requests bypass auth when the API is configured with
`COTERIE_API_ALLOW_LOCALHOST=1` (default), so the TUI works out of the box
against a local server.

Use a personal access token from the web settings page to talk to a remote
deployment:

```bash
export COTERIE_API_URL=https://coterie.example.com
export COTERIE_API_TOKEN=ck_…
coterie-tui list
```
