# reverse-api-engineer (bundled skills)

Source: https://github.com/kalil0321/reverse-api-engineer at commit `c644f8a`, path `skills/`. Licence: MIT (see `vendor/LICENSES.md`).
4 files bundled unchanged. Read one with `python3 scripts/vendor.py reverse-api-engineer <path>`; restore them with `python3 scripts/vendor.py --export <dir> --source reverse-api-engineer`.

<!-- vendor-file: reverse-api-engineer/SKILL.md -->
---
name: reverse-api-engineer
description: Reverse engineer a website's private HTTP API into a typed, runnable client (Python, TypeScript, Go and 7 more) with the reverse-api-engineer CLI. A browser performs the task while rae reads the site's real network traffic, then a model writes the client. Use when the user wants to call a site programmatically and it has no public API, or the public one lacks what the browser can do. Skip it when an official API or SDK already covers the task.
---

# Reverse API Engineer

`reverse-api-engineer` (rae) drives a browser through a task, reads the requests the website makes, and turns them into an API client. The `chrome-mcp` provider works in the user's own Chrome, so their logins carry over. The `auto` provider (Playwright) uses a fresh browser and records a HAR file, which lets a run be re-engineered later without browsing again. Which one runs depends on the user's config and rae version; step 3 shows how to check.

This skill only supplies instructions. It drives the CLI through its scripted, JSON-emitting commands.

## 1. Check the install

```bash
reverse-api-engineer --version
```

If the command is missing, ask the user before installing anything, then:

```bash
uv tool install reverse-api-engineer   # or: pipx install reverse-api-engineer
```

Agent mode also needs Node.js 20.19+ on `PATH` (it launches browser tooling through `npx`). See [setup and configuration](references/setup.md) for model access and settings.

## 2. Reuse an earlier capture when one exists

```bash
reverse-api-engineer list --search "<site or task>" --json
```

`list` also includes failed and interrupted attempts, so check a candidate before reusing it:

```bash
reverse-api-engineer show <run_id> --json
```

- `file_count > 0` means a client was generated: verify it in step 5 and reuse it if it covers the task.
- `har_entries > 0` means the traffic was saved: you can improve the client with `engineer` (step 6) instead of browsing again. `chrome-mcp` runs keep no HAR (`mode: "chrome-mcp"`), so they cannot be re-engineered.
- Otherwise, capture again from step 3.

## 3. Preflight

```bash
reverse-api-engineer agent -p "<goal>" -u "<start url>" --dry-run
```

This validates the prompt, URL, config and environment without opening a browser. Fix every `error` check before running. A `warn` on the API key is fine when the SDK authenticates another way (for example a logged-in Claude Code).

`would_run.agent_provider` in the output is the browser the run will use. `chrome-mcp` means the user's own Chrome with their logins; `auto` and `agent-browser` start a fresh browser without them. When the task needs the user's login and the provider is not `chrome-mcp`, ask before switching it (see [sessions](references/sessions.md)).

For `chrome-mcp`, the `chrome-mcp:auto-connect` check covers the connection to the user's Chrome:

- `ok`: Chrome is reachable. The user still has to accept Chrome's connection prompt when the run starts.
- `error`: it is not. If the site needs the user's login, ask them to open Chrome 146+ and enable remote debugging at `chrome://inspect/#remote-debugging` ("Enable auto-connect"), then run the preflight again. For public data, add `--headless`: rae then starts its own headless Chrome, without the user's sessions, and skips the check.
- `warn`: this rae version cannot test the connection. Ask the user to confirm Chrome is open with auto-connect enabled before a headed run, or use `--headless` for public data.

Write the goal as the data the user wants, not the clicks: "fetch open roles with title, location and team from the careers page, including pagination" works better than "click the jobs tab".

## 4. Capture and generate

A run takes several minutes, often longer than a shell tool's default timeout. Start it in the background from the outset, with your shell tool's background option when it has one, or with `&`:

```bash
reverse-api-engineer agent -p "<goal>" -u "<start url>" --json-stream > rae-run.ndjson 2> rae-run.log &
echo $! > rae-run.pid
```

`--json-stream` writes one NDJSON event per line and ends with a `{"event":"result",...}` line. The run is finished when that line appears in `rae-run.ndjson`, or when the process in `rae-run.pid` has exited (`kill -0 "$(cat rae-run.pid)"` fails). Check progress with `tail rae-run.log`. Never start a second capture while one is still running: it repeats the work and the cost.

- Without `--headless`, `chrome-mcp` opens its own tab in the user's Chrome and closes only that tab. Tell the user before starting, since it acts in their browser, and ask them to accept the connection prompt Chrome shows: if nobody accepts it, the run times out without a client.
- Add `--headless` for public sites, or on machines without a display.
- Add `-o <dir>` to write runs somewhere other than `~/.reverse-api/runs`.
- `--json` prints the same result as a single object at the end, with no progress. Use it only when the shell can wait for the whole run.
- See [sessions and blocked sites](references/sessions.md) for logged-in sites and providers.

The final result line has these fields:

| Field | Meaning |
|---|---|
| `status` | `ok` or `error` |
| `run_id` | Id for `engineer`, `run` and `show` |
| `script_path` | The generated client, inside `<runs>/scripts/<run_id>/` next to its `README.md` |
| `har_path` | The raw capture; `null` for `chrome-mcp` runs, which keep no HAR |
| `usage.total_cost_usd` | Model cost of the run; report it to the user |
| `error_kind` | Set on failure; see [troubleshooting](references/troubleshooting.md) |

Exit codes: `0` success, `1` capture or engineering failed, `2` misuse.

## 5. Verify the client

Read the generated client and its `README.md` before running anything: it is model-written code. Then run it:

```bash
reverse-api-engineer run <run_id> --ls                       # list generated files
reverse-api-engineer run <run_id> --file <client file> --json -- <script args>
```

`--auto-install` installs missing dependencies without prompting; ask the user first. Check that the output contains real data from the site, not just a 200 status.

## 6. Iterate on the same capture

```bash
reverse-api-engineer engineer <run_id> -p "add pagination and a typed Job model" --json
reverse-api-engineer engineer <run_id> --fresh -p "only the search endpoint" --json
```

Without `--fresh`, the prompt is layered on top of the original goal and the existing client. With `--fresh`, the client is regenerated from the HAR. `engineer` needs a HAR, so it only works on runs from the `auto` or `agent-browser` providers and from manual mode; on a `chrome-mcp` run it exits `2` with `error_kind: misuse`. For those, or when the capture itself is missing an endpoint, run `agent` again with a more specific goal.

## 7. Hand it over

The client lives at `script_path` from the result. When `real_time_sync` is on (the default), rae also copies it to `./scripts/<descriptive_name>/` in the working directory; copy it from `script_path` when that folder is missing. Adapt names and types to their codebase, and keep the generated `README.md` as usage notes. Tell the user which endpoints it wraps and how auth is handled (cookies, bearer token, CSRF), since captured credentials expire.

## Boundaries

- Only capture sites the user is allowed to access, and respect their terms and rate limits.
- Captures can contain cookies and tokens. Do not paste HAR contents into chats, issues or commits.
- When a site needs a human (captcha, 2FA, unusual login), ask the user to capture it in manual mode, then continue with `engineer`. See [sessions and blocked sites](references/sessions.md).

<!-- /vendor-file -->

<!-- vendor-file: reverse-api-engineer/references/sessions.md -->
# Sessions and blocked sites

## Logged-in sites

The `chrome-mcp` provider drives the user's own Chrome, so existing sessions carry over. It is the default for new configs in recent rae versions; older versions and older configs use `auto`, a fresh Playwright browser with no cookies. `agent --dry-run` shows the active one as `would_run.agent_provider`. Switch `agent_provider` in `~/.reverse-api/config.json` to `chrome-mcp` only with the user's agreement.

Headed `chrome-mcp` requires Chrome 146+ running with auto-connect enabled at `chrome://inspect/#remote-debugging`. Recent rae versions check this in `agent --dry-run` as `chrome-mcp:auto-connect` and stop a headed run with `error_kind: config_invalid` when it fails; older versions only warn, so ask the user to confirm it. With `--headless`, rae starts its own Chrome: no existing sessions, and no check.

`chrome-mcp` keeps no HAR, so these runs cannot be re-engineered with `engineer`. When the user expects to iterate on the same capture many times, the `auto` provider records a HAR, at the cost of a fresh browser without their sessions.

The generated client will need the same auth. Make sure it reads cookies or tokens from the environment or a file the user controls, never from values hardcoded out of the capture.

## When the agent cannot get through

Captchas, 2FA, device checks and aggressive bot detection can stop agent mode. Do not try to bypass them. Instead, ask the user to capture the flow themselves:

1. The user runs `reverse-api-engineer` in a terminal, switches to `manual` mode with Shift+Tab, and enters the goal.
2. A browser opens. The user logs in and performs the task, then closes the browser.
3. rae generates a client from that capture and saves the run.

Then pick the run up from your side:

```bash
reverse-api-engineer list --mode manual -n 5 --json
reverse-api-engineer engineer <run_id> -p "<refinements>" --json
```

## Good capture goals

- Name the data and its fields: "product name, price, stock and seller for a search query".
- Name the variations the client must handle: pagination, filters, sorting, detail pages.
- Keep one goal per run. A client for "search" and one for "checkout" are easier to verify separately.

<!-- /vendor-file -->

<!-- vendor-file: reverse-api-engineer/references/setup.md -->
# Setup and configuration

## Requirements

- Python 3.11+ and `uv` (or `pipx` / `pip`).
- Node.js 20.19+ with `npx` on `PATH` for agent mode.
- Headed `chrome-mcp` runs: Chrome 146+ running, with remote debugging enabled at `chrome://inspect/#remote-debugging`.
- Manual mode only: `uv tool install "reverse-api-engineer[manual]"`, then `playwright install chromium`.

## Model access

rae calls a model through the SDK selected in its config:

| `sdk` | Auth |
|---|---|
| `claude` (default) | `ANTHROPIC_API_KEY`, or an existing Claude Code login |
| `opencode` | An OpenCode server rae starts or reuses. Defaults to a free model; can route to local models through Ollama |
| `copilot` | GitHub Copilot credentials (`GITHUB_COPILOT_TOKEN`) |
| `cursor` | `CURSOR_API_KEY` |

`agent --dry-run` reports which of these it can see. A missing env var is a warning, not an error, because some SDKs find credentials on their own.

## Settings

Settings live in `~/.reverse-api/config.json`. Only two have per-run flags on `agent`: `-o/--output-dir` and `-m/--model` (for the `claude` SDK). Change the others by editing that file, and only with the user's agreement since it affects every later run. Keys that matter most:

| Key | Values |
|---|---|
| `agent_provider` | `chrome-mcp` (the user's real Chrome, no HAR; default for new configs in recent versions), `auto` (Playwright MCP, records a HAR; the default in older versions), `agent-browser` (Vercel agent-browser CLI, records a HAR) |
| `output_language` | `python`, `javascript`, `typescript`, `go`, `java`, `csharp`, `php`, `ruby`, `c`, `powershell` |
| `sdk` | `claude`, `opencode`, `copilot`, `cursor` |
| `claude_code_model` | Model for the `claude` SDK; `agent -m` overrides it per run |
| `output_dir` | Where runs are stored; `null` means `~/.reverse-api/runs` |

The user can also change them interactively by running `reverse-api-engineer` and typing `/settings`.

Language notes: C needs a POSIX toolchain with libcurl headers. PowerShell needs `pwsh` 7+.

<!-- /vendor-file -->

<!-- vendor-file: reverse-api-engineer/references/troubleshooting.md -->
# Troubleshooting

Failed runs return `status: "error"` with an `error` message and an `error_kind`:

| `error_kind` | Usual cause | What to do |
|---|---|---|
| `misuse` | Missing `-p` in scripted mode, bad flag, invalid URL, `engineer` on a run without a HAR | Fix the command; `--dry-run` shows which check fails |
| `config_invalid` | Bad value in `~/.reverse-api/config.json`, unknown SDK or provider | Run `agent --dry-run`, fix the named key |
| `permission_denied` | The OS or host refused a file or process ("permission denied") | Check write access to `~/.reverse-api` and the working directory |
| `network` | Site or model API unreachable, a request timed out, proxy issues | Retry once; if it persists, check connectivity before rerunning |
| `engine_failure` | The browser tooling or model session failed mid-run | Rerun with `RAE_DEBUG=1` to get a traceback on stderr |
| `interrupted` | The run was cancelled (Ctrl+C or SIGINT) | Rerun in the background (SKILL.md step 4) if a foreground command was cut off |
| `unknown` | Anything else, including rejected model credentials | Read the `error` text; for auth errors check the SDK auth in [setup](setup.md). Do not retry blindly |

Other cases:

- **`config_invalid` with "Chrome remote debugging is not enabled" or "Chrome is not running"**: the `chrome-mcp` provider could not reach the user's Chrome. Ask them to open Chrome 146+ and enable auto-connect at `chrome://inspect/#remote-debugging`, or add `--headless` when the site does not need their login.
- **A headed `chrome-mcp` run ends within a minute without a client, and `rae-run.log` shows `new_page` timing out**: Chrome's connection prompt went unanswered. Ask the user to watch Chrome and accept the prompt, then run again. For public data, `--headless` avoids the prompt. Older rae versions report such a run as `status: ok` with a `script_path` that does not exist, so check that the file exists.
- **`engineer` exits `2` with "captured with chrome-mcp"**: that run has no HAR. Run `agent` again with a more specific goal instead.
- **The run stalls right after the agent closes the browser**, and `<runs>/har/<run_id>/` only holds `recording.har.tmp`: the `auto` provider ran a `rae-playwright-mcp` older than 0.0.9, which hangs on Node 26. Run `npx -y rae-playwright-mcp@latest --version` to fetch the fixed release (it prints `Version 0.0.9` or later), then rerun.
- **No browser on the machine**: add `--headless`.
- **`node` or `npx` not found**: agent mode needs Node.js 20.19+; install it only with the user's approval.
- **The client runs but returns empty or wrong data**: the capture probably missed the request. Rerun `agent` with a goal that exercises it (for example "scroll to load page 2"), or, when the run has a HAR, check `har_path` for the endpoint before re-engineering.
- **Auth works once, then fails**: captured cookies or tokens expired. Make the client take fresh credentials instead of embedding them.
- **`run` picks the wrong file or asks which script to run**: pass `--file` explicitly; `run <run_id> --ls` lists the files.

Do not retry an unchanged command that already failed twice. Report the `error` text to the user instead.

<!-- /vendor-file -->

