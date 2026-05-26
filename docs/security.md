# Security review

Scope: `coterie-api` (the HTTP server) and the parts of `coterie` it drives
(subprocess executors, LLM clients). Last reviewed 2026-05-26. This is a
self-assessment, not a third-party audit.

## Threat model

**Assets.** Provider API keys (operator env vars; also transiently in
`/api/auth/providers/test` requests), session cookies, personal access tokens
(PATs), the legacy service token, run data (task prompts + agent output), and
the host working directory (agents edit it in place).

**Trust boundaries.** Untrusted: anonymous HTTP clients, the `task`/`config`
submitted on a run, and agent CLI stdout. Trusted: the operator-provided
environment (keys, secrets) and the agent CLIs themselves (Claude Code, Codex,
… each enforce their own permission systems — Coterie's isolation is
belt-and-suspenders).

**Actors.** Anonymous internet → authenticated user (GitHub OAuth, PAT, or the
single legacy token) → the agent subprocesses spawned per run.

## Reviewed and sound

- **SQL injection** — every query in `store.py` / `users.py` is parameterized
  (`?` placeholders). The one dynamic statement (`UPDATE runs SET …`) interpolates
  only a fixed allowlist of **column names**; all values are bound. No string-built SQL.
- **Command / argument injection** — no `shell=True` anywhere. Commands are
  built as argv lists (`adapters/*.build_command`), and the user-controlled
  prompt is bound as a **flag value** (e.g. `["claude", "-p", prompt]`), so it
  can't be reparsed as a flag or a shell token. Workdir isolation via
  `IsolatedWorktreeExecutor`; `DockerSwarmExecutor` defaults to `--network=none`
  and does **not** bind-mount the Docker socket.
- **Auth** — sessions and PATs use `secrets.token_urlsafe(32)` (CSPRNG, 256-bit);
  PATs are stored sha256-hashed and shown exactly once; the legacy token is
  compared with `secrets.compare_digest` (constant-time); session expiry is
  enforced in the lookup query and purged on a loop.
- **Error envelope** — uniform `{error, code, request_id, detail}`; the 500
  catch-all logs the traceback server-side but returns a generic body. No secrets
  are logged in the normal paths.
- **CORS** — explicit env-driven allowlist; never a wildcard origin with
  `allow_credentials=True`.
- **Abuse controls** — slowapi rate limiting and per-user daily USD budget caps
  on run creation; the provider-key probe is rate-limited (`10/min`).

## Fixed during this review

| Severity | Issue | Fix |
|---|---|---|
| High | GitHub OAuth state signer fell back to a **hardcoded** secret (or reused `COTERIE_API_TOKEN`) when `COTERIE_API_STATE_SECRET` was unset — a predictable key defeats the CSRF state. | `oauth.py`: require an explicit secret, else generate an ephemeral random one (with a warning); never predictable. |
| Medium | OAuth `next` redirect was concatenated onto `WEB_BASE` unchecked — `@evil.com` / `//evil.com` could open-redirect. | `oauth.py` `_safe_next()`: only same-origin relative paths; everything else → `/`. |
| Low | 422 validation responses echoed Pydantic's `input` field, which could reflect a submitted `api_key` back in the body. | `errors.py`: keep only `loc`/`msg`/`type`. |

## Residual / operational notes

- **Provider keys transit the server** on `/api/auth/providers/test` (used for a
  single auth-only probe, never stored or logged). Serve over HTTPS only.
- **`--forwarded-allow-ips=*`** in the container CMD is acceptable because the
  localhost auth bypass is disabled in the image (`COTERIE_API_ALLOW_LOCALHOST=0`).
  Keep that env at `0` on any non-local deploy; for stricter rate-limit integrity,
  narrow `--forwarded-allow-ips` to the proxy CIDR.
- **PAT hashes are unsalted sha256** — acceptable because the tokens are 256-bit
  random (no dictionary/rainbow exposure). HMAC-with-a-server-key is the
  gold-standard upgrade.
- **No "revoke all sessions" endpoint** yet; sessions carry a 30-day TTL and are
  purged on expiry.
- **Agent execution** runs the configured CLIs with the operator's local
  credentials and lets them edit the workdir. Run untrusted tasks under
  `DockerSwarmExecutor` (`network=none`) or an external sandbox.

## Deployment hardening checklist

- [ ] `COTERIE_API_STATE_SECRET` set (required if GitHub OAuth is enabled)
- [ ] `COTERIE_API_ALLOW_LOCALHOST=0`
- [ ] HTTPS terminated upstream; cookies are `Secure` + `HttpOnly` + `SameSite=Lax`
- [ ] `COTERIE_CORS_ORIGINS` limited to the real web origin(s)
- [ ] Real `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` if using OAuth
- [ ] Per-user daily budget cap (`COTERIE_DEFAULT_DAILY_CAP_USD`) sized for the deploy
- [ ] Container isolation (`DockerSwarmExecutor`) for any untrusted task input
