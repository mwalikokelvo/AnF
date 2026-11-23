# strix (bundled skills)

Source: https://github.com/usestrix/strix at commit `6b7ae2e`, path `skills/`. Licence: Apache-2.0 (see `vendor/LICENSES.md`).
9 files bundled unchanged. Read one with `python3 scripts/vendor.py strix <path>`; restore them with `python3 scripts/vendor.py --export <dir> --source strix`.

<!-- vendor-file: api-security-testing/SKILL.md -->
---
name: api-security-testing
description: Security-test a REST, GraphQL, or gRPC API with Strix — autonomous agents that enumerate endpoints from an OpenAPI/GraphQL schema (or by crawling), then actually exploit the API-specific vulnerability classes in the OWASP API Security Top 10 (2023) — broken object-level authorization (BOLA/IDOR), broken object property level authorization (excessive data exposure and mass assignment), broken function-level authorization, unrestricted resource consumption, SSRF, injection, and auth/token flaws. Every finding comes with a working proof-of-concept request. Use when the user asks to pentest, security-test, audit, or find vulnerabilities in an API, endpoint, or backend service.
license: Apache-2.0
metadata:
  author: usestrix
  homepage: https://docs.strix.ai
---

# Security-test an API

APIs fail differently from web UIs: there is no rendered surface to crawl, the interesting bugs are authorization-shaped rather than injection-shaped, and the same endpoint behaves differently per token. This workflow targets those specifics with Strix's autonomous agents, using the current [OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) as the coverage checklist. For the web-app equivalent, the current edition is the OWASP Top 10:2025 — see **owasp-top-10-testing**.

Install, LLM setup, full CLI flags, and the managed-cloud path are in the **penetration-testing-with-strix** skill. Read it if `strix --version` fails or the target is not an API. For a run with no Docker and no LLM key, the same binary drives the managed platform: `strix cloud login`, then `strix cloud scans start ...` (details in **managed-pentesting-with-strix**).

## 1. Gather what the agents need

APIs are near-impossible to test blind, so collect first:

| Input | Why it matters |
|---|---|
| **Schema** — OpenAPI/Swagger file, Postman collection, GraphQL endpoint (introspection), or a gRPC `.proto` | Turns guesswork into full endpoint enumeration. Biggest single win in coverage. An OpenAPI/Swagger or Postman spec (`.json`/`.yaml`/`.yml`) is a target Strix takes directly; a `.proto` is not, so pass it with `--workspace-file`. |
| **Two sets of credentials/tokens**, ideally in different tenants | BOLA/IDOR — API1:2023, still the #1 API risk — can only be *proven* by accessing tenant A's objects with tenant B's token. |
| **A low-privilege and a high-privilege token** | Required to prove broken function-level authorization (API5:2023 — a `user` calling admin-only routes). |
| **Example object IDs** | Lets agents test ID tampering immediately instead of hunting for valid identifiers. |
| **Out-of-scope routes** | Payments, mass notification, destructive admin endpoints. |
| **Rate limits / WAF** in front of the API | Avoids agents burning budget on throttled requests; mention them so testing adapts. |

Ask the user for anything missing — do not fabricate tokens or scan an API they do not own.

## 2. Run the scan

Pass the spec as a **target**, not as prose in the instruction — Strix parses OpenAPI/Swagger (`.json`/`.yaml`) and Postman collection exports directly, so the agents start from the real endpoint list:

```bash
strix -n -t ./openapi.yaml -t https://api.staging.example.com --max-budget 20 \
  --instruction "Tenant A token: <tokenA> (org 1111, user id 11, order id 501).
Tenant B token: <tokenB> (org 2222, user id 22).
Admin token: <tokenAdmin>.
Focus: BOLA across orgs (API1), function-level authz on /admin/* (API5), object property level authz on PATCH /users/{id} — both mass assignment and over-exposed fields in list responses (API3), unrestricted resource consumption (API4).
Out of scope: POST /billing/*, POST /notifications/broadcast."
```

- **Postman instead of OpenAPI:** a collection export works as a target (`-t ./collection.postman_collection.json`), or pull one live with `-t postman://<collection-uuid>` (optionally `"postman://<collection-uuid>?env=<environment-uuid>"`), which needs `POSTMAN_API_KEY` in the environment.
- **Many services at once:** put one target per line in a file and pass `--target-list ./targets.txt`, repeatable and combinable with `-t`.
- **Add the backend source for depth:** `-t ./services/api -t https://api.staging.example.com`. With code access the agents can reason about authorization checks and object ownership rather than inferring them from responses.
- **gRPC:** target the endpoint and pass the definition as a workspace file, `-t https://grpc.staging.example.com --workspace-file ./service.proto`. Only `.json`, `.yaml`, and `.yml` specs are recognized as targets, so `-t ./service.proto` fails with "Path exists but is not a directory".
- **GraphQL:** point at the GraphQL endpoint and say whether introspection is enabled; call out that you want batching/aliasing abuse, depth/complexity limits, and per-field authorization tested.
- **Internal/private APIs** unreachable from your machine: use the managed platform's network connector — see **managed-pentesting-with-strix**.
- Use `--instruction-file` when the credential/context block gets long, and keep tokens out of shell history and out of committed files.
- **Supporting files** the agents should read but not test, such as an endpoint wordlist or handwritten notes about the tenancy model: pass `--workspace-file ./notes.md`. Strix copies the file into `/workspace`. The file on your machine does not change. Add `:DEST` to choose the path, for example `--workspace-file ./wordlist.txt:lists/wordlist.txt`.

## 3. Verify findings

`strix_runs/<run>/penetration_test_report.md` first, then `vulnerabilities/*.md` — each contains the exact request that proved the issue. Replay it (for example, with `curl`) before reporting; for authorization findings, confirm the response really contains the other tenant's data rather than an empty 200.

`findings.sarif` uploads to GitHub code scanning; `vulnerabilities.json` is the structured index for ticketing.

## 4. Fix, re-test, and keep it tested

Remediate with **fix-security-vulnerabilities-with-strix** (fix the authorization check, not the single endpoint), then re-run against the same target to prove the exploit is dead. Wire it into pull-request CI with **ci-security-scanning-with-strix** so new endpoints get tested as they ship.

<!-- /vendor-file -->

<!-- vendor-file: application-security-testing/SKILL.md -->
---
name: application-security-testing
description: Application security testing (AppSec) across a whole product with Strix — decide which asset needs which test (source code, running web app, API, CI pipeline), run it, and turn the results into a ranked remediation plan. Autonomous agents exploit and prove each issue instead of emitting static-analysis alerts, so the plan is ordered by what is actually reachable. Use when the user asks for an application security review or audit, an appsec assessment, vulnerability scanning across their stack, a security review before a launch or a customer security questionnaire, or does not yet know which kind of security test they need.
license: Apache-2.0
metadata:
  author: usestrix
  homepage: https://docs.strix.ai
---

# Application security testing

Entry point for "make my application secure" requests, where the target is not yet a single URL or repo. The job here is to pick the right test per asset, run it, and produce one ranked plan — not to run everything at maximum depth.

Install, LLM setup, all CLI flags, and the managed-cloud path live in the **penetration-testing-with-strix** skill. Read it first if `strix --version` fails. For a run with no Docker and no LLM key, the same binary drives the managed platform: `strix cloud login`, then `strix cloud scans start ...` (details in **managed-pentesting-with-strix**).

Only test assets the user owns or is authorized to test. Confirm authorization before the first run, and prefer staging over production, because the agents send real exploit payloads and can change data.

## 1. Map the assets

Ask (or read from the repo) and write the answers down before scanning:

- **Source** — one repo, a monorepo, several services? Which languages/frameworks?
- **Running environments** — is there a staging deployment? A public production site? A local dev server only?
- **APIs** — REST, GraphQL, gRPC? Is there an OpenAPI/GraphQL schema?
- **Authentication** — can you get two test accounts in different tenants? Most high-impact bugs need them.
- **Constraints** — out-of-scope paths, whether production may be touched, budget and wall-clock limits.

If there is no staging environment and production is off limits, say so early. A code-only review is still valuable, but it cannot prove exploitability against a live app.

## 2. Pick the right test per asset

| Asset | Skill to use |
| --- | --- |
| Repository or working tree | **find-security-vulnerabilities-in-code** |
| Live web app or staging site | **web-app-penetration-testing** |
| REST/GraphQL/gRPC API | **api-security-testing** |
| Assessment mapped to OWASP categories | **owasp-top-10-testing** |
| Every pull request, continuously | **ci-security-scanning-with-strix** |
| No Docker, no LLM key, or a report an auditor will accept | **managed-pentesting-with-strix** |

Those skills carry the flags, credential handling, and result-reading details. Do not duplicate their instructions here.

Sequence for a first assessment:

1. Review the code. It is the cheapest run and it maps the authorization model.
2. Pentest staging with credentials, and pass the repo as a second target so the agents keep source context.
3. Add CI scanning, so later regressions are caught without another manual pass.

Run one asset at a time and read each report before starting the next. Findings from the code review make the live run sharper.

## 3. Consolidate into one plan

Findings arrive per run in `strix_runs/<run>/`. Merge them into a single list and rank by **proven impact**, not by scanner severity:

1. Validated exploits reachable without authentication.
2. Validated cross-tenant or privilege-escalation issues.
3. Validated issues needing an authenticated account.
4. Unproven observations (configuration, dependency, and hardening notes) — flag as such, and never present them as confirmed vulnerabilities.

Deduplicate: the same root cause often surfaces in both the code review and the live pentest.

## 4. Be honest about coverage

State plainly what was *not* tested — assets with no staging environment, categories a black-box run cannot reach (logging and alerting, supply-chain integrity, insecure design), and any run that hit its budget or turn cap before finishing. Check `run.json` status and cost against `--max-budget` for each run. An empty result set from a truncated scan is not a clean bill of health.

Then remediate with **fix-security-vulnerabilities-with-strix**, which re-runs Strix against each fix to prove the exploit no longer works.

<!-- /vendor-file -->

<!-- vendor-file: ci-security-scanning-with-strix/SKILL.md -->
---
name: ci-security-scanning-with-strix
description: Add security scanning to CI/CD with Strix — GitHub Actions, GitLab CI, or any pipeline — so every pull request gets a diff-scoped AI pentest that blocks vulnerable code before it merges, with results as PR comments and SARIF uploaded to code scanning. Covers both the self-hosted open-source CLI (runs in your runner) and the managed app.strix.ai platform (GitHub/GitLab app or API, no runner infra). Use when the user asks to add security scanning, SAST/DAST, pentesting, vulnerability checks, or automated security review to their CI pipeline, pre-merge gate, or PR workflow.
license: Apache-2.0
metadata:
  author: usestrix
  homepage: https://docs.strix.ai
---

# Set up Strix in CI/CD

You can gate PRs two ways — pick based on the environment, or combine them:

- **Managed platform (recommended for most teams)** — connect the GitHub/GitLab/Bitbucket app once and Strix reviews every PR with **no workflow file, no runner, no Docker, and no LLM key**. Results post as PR comments and land in the team dashboard. Best when you want zero CI maintenance, central tracking, or your runners lack Docker. See "Managed platform" below and the **managed-pentesting-with-strix** skill.
- **Self-hosted OSS CLI in your runner** — run a diff-scoped scan as a pipeline step. Fully in your infra, free (BYO LLM key), no external account. Requires Docker on the runner. Best for air-gapped/self-hosted CI or when you do not want scans leaving your environment.

Both fail the build on validated findings and both emit SARIF 2.1.0, so you can start with one and add the other later.

---

# Option A — Self-hosted OSS CLI in the runner

Run a diff-scoped Strix scan on every PR: only changed files are tested, `quick` mode keeps it fast, and exit code `2` fails the build when validated vulnerabilities are found.

## GitHub Actions

Create `.github/workflows/security.yml`:

```yaml
name: Security Scan

on:
  pull_request:

jobs:
  strix-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # required for diff-scope resolution

      - name: Install Strix
        run: curl -sSL https://strix.ai/install | bash

      - name: Run Security Scan
        env:
          STRIX_LLM: ${{ secrets.STRIX_LLM }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
        run: strix -n -t ./ --scan-mode quick --max-budget 10

      # Don't fail open: a run that hits the hard budget stop exits 0 but leaves
      # run.json status "stopped", not "completed". Enforce completion explicitly.
      # This does not catch an agent that wrapped up early on a budget *warning*
      # (it still calls finish_scan and records "completed"), so size the budget.
      - name: Fail unless the scan completed
        run: |
          run_json=$(ls -t strix_runs/*/run.json | head -1)
          status=$(jq -r .status "$run_json")
          if [ "$status" != "completed" ]; then
            echo "Strix run status is '$status' — the scan did not complete (likely budget exhausted). Raise --max-budget." >&2
            exit 1
          fi
```

Then tell the user to add two repository secrets: `STRIX_LLM` (model id, for example `openrouter/z-ai/glm-5.3`) and `LLM_API_KEY` (the provider key). Do not create these values yourself.

Notes:
- In CI/headless runs Strix automatically scopes to the PR's changed files (`--scope-mode auto`). If diff resolution fails, keep `fetch-depth: 0` or set `--diff-base` to the PR's actual base branch — use `origin/${{ github.base_ref }}` in GitHub Actions rather than a hard-coded `origin/main`, since repos use different default branches.
- Exit codes: `0` pass, `2` vulnerabilities found (fails the job), `1` setup error. Add `--fail-on high` to fail only on high/critical findings; lower ones are still reported, so a passing job is not a finding-free report.
- The runner needs Docker (default GitHub-hosted Ubuntu runners have it).
- **Size the budget so the scan completes — do not let it fail open.** A `0` exit means "no validated vulnerabilities in what was analyzed"; if `--max-budget` is hit before the diff is fully covered, the scan wraps up early and can still exit `0`. The "Fail unless the scan completed" step above narrows the gap: `strix_runs/<run>/run.json` is `"stopped"` when the scan was cut off at the hard budget limit without a final report. It is not a complete guard — the agents get graduated wrap-up warnings before that limit, and a run that wraps up on a warning still calls `finish_scan` and records `"completed"` with partial coverage. So keep that step in any pipeline that gates merges **and** give the scan real headroom (compare `run.json`'s `llm_usage.cost` against `--max-budget`; if it ran right up to the cap, raise it). For a `quick` diff-scoped PR scan `--max-budget 10` is usually ample, raise it for large diffs.

### Optional: upload findings to GitHub code scanning

Strix writes SARIF 2.1.0 to `strix_runs/<run>/findings.sarif`:

```yaml
      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: strix_runs
```

## Other CI systems

Any pipeline works the same way — install, set the two env vars, run headless:

```bash
curl -sSL https://strix.ai/install | bash
# Resolve the PR's base branch robustly (use your CI's base-branch variable if it
# has one, for example GitHub Actions: origin/${{ github.base_ref }}). Avoid piping the
# git lookup into another command — a failed lookup would otherwise be masked.
BASE_BRANCH="${CI_MERGE_REQUEST_TARGET_BRANCH_NAME:-}"   # GitLab MR target
if [ -z "$BASE_BRANCH" ]; then
  BASE_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)
  BASE_BRANCH="${BASE_BRANCH#origin/}"
fi
DIFF_BASE="origin/${BASE_BRANCH:-main}"
# Fail loudly rather than silently narrowing scope (for example, to HEAD~1, which on a
# multi-commit branch would scan only the last commit and let earlier ones pass).
if ! git rev-parse --verify --quiet "$DIFF_BASE" >/dev/null; then
  echo "Cannot resolve diff base '$DIFF_BASE'. Fetch the base branch (git fetch origin <base>) or set --diff-base explicitly." >&2
  exit 1
fi
strix -n -t ./ --scan-mode quick --scope-mode diff --diff-base "$DIFF_BASE" --max-budget 10
```

Gate the pipeline on the exit code (see the budget/fail-open caveat above — give the scan enough budget to finish). Schedule `standard` scans nightly and `deep` scans for release candidates.

---

# Option B — Managed platform (no runner infra)

No workflow file, no Docker, no LLM key. Three ways to use it:

1. **PR-review app (zero code):** the user installs the Strix GitHub/GitLab/Bitbucket app and enables PR reviews for the repo in the app.strix.ai dashboard. Every PR is then reviewed automatically, with findings posted as PR comments. Nothing to add to the repo. This is the lowest-effort path — recommend it first when the user just wants PR gating.

2. **CLI-triggered from any pipeline:** if you want to trigger from an existing pipeline (or a system without the SCM app), use the same `strix` binary with a token that has `pr_reviews:write`. Store the token as a CI secret and ask the user to create it at **Settings → API Access**. Read the repository's `provider` and `installation_id` once with `strix cloud repos list`. Example GitHub Actions step:

   ```yaml
   - name: Strix PR review (managed)
     if: github.event_name == 'pull_request'
     env:
       STRIX_API_TOKEN: ${{ secrets.STRIX_API_TOKEN }}
     run: |
       curl -sSL https://strix.ai/install | bash
       strix cloud pr-reviews start \
         --provider github \
         --installation-id "${{ vars.STRIX_INSTALLATION_ID }}" \
         --repository-full-name "${{ github.repository }}" \
         --pr-number "${{ github.event.pull_request.number }}"
   ```

   Output is JSON when stdout is not a terminal, and there are no prompts without a TTY. To gate the build on results, poll `strix cloud pr-reviews get <id> --json` and fail on unresolved criticals or highs. The raw REST endpoint (`POST /api/v1/pr-reviews/start`) works too when the pipeline cannot install the CLI.

3. **Source upload from a pipeline without an SCM app:** upload the checked-out tree as a cloud code review (`scans:write` and `uploads:write`). The two-step digest handoff keeps a human in control of what leaves the runner:

   ```bash
   strix cloud scans start --source . --dry-run --show-files --json   # review, capture source.archive_sha256
   strix cloud scans start --source . --approve-sha256 "$SOURCE_SHA256" --wait
   ```

   Exit codes: `0` success, `4` auth or plan limit, `5` payment required. Non-Enterprise scans consume credits.

Full CLI coverage (PR reviews, scans, SARIF export, schedules) is in the **managed-pentesting-with-strix** skill.

Recommend Option B for most teams (no maintenance, central dashboard); use Option A when scans must stay entirely within your own infrastructure.

<!-- /vendor-file -->

<!-- vendor-file: find-security-vulnerabilities-in-code/SKILL.md -->
---
name: find-security-vulnerabilities-in-code
description: Find security vulnerabilities in a codebase or repository with Strix — a white-box AI security review that reads your source, reasons about the actual data flow and authorization model, then exploits what it finds in a live sandbox so every reported issue has a working proof-of-concept instead of a noisy static-analysis alert. Covers injection, XSS, SSRF, broken access control and IDOR, insecure deserialization, secrets in code, unsafe dependencies, and business-logic flaws. Use when the user asks to security-scan, security-review, or audit their code, repo, or pull request for vulnerabilities.
license: Apache-2.0
metadata:
  author: usestrix
  homepage: https://docs.strix.ai
---

# Find security vulnerabilities in code

White-box security review with Strix: the agents read the source to build a model of routes, sinks, and authorization checks, then attempt real exploitation. Findings come with a proof-of-concept, so the output is a short list of proven issues rather than the hundreds of "potential" hits a pattern-matching scanner produces.

Install, LLM setup, all flags, and the managed-cloud path are in the **penetration-testing-with-strix** skill. For a run with no Docker and no LLM key, the same binary drives the managed platform: `strix cloud login`, then `strix cloud scans start ...` (details in **managed-pentesting-with-strix**).

## Run it

```bash
# Local working tree
strix -n -t ./ --scan-mode standard --max-budget 15

# A GitHub repo directly
strix -n -t https://github.com/org/app --max-budget 15

# Monorepo: point at the service that matters, not the whole tree
strix -n -t ./services/checkout --max-budget 20

# Only what a branch changed (whole-repo review is wasteful on a large repo)
strix -n -t ./ --scope-mode diff --diff-base origin/main --max-budget 10
```

A local path is mounted into the sandbox **writable**, so the agents can modify it. Run against a clean checkout.

Two things sharply improve results:

1. **Add a running instance of the app.** `-t ./ -t http://host.docker.internal:3000` lets the agents confirm exploitability against live behavior instead of reasoning about it statically — this is the difference between "this looks unsafe" and a validated finding. If nothing is running, static-only findings should be described as unconfirmed.
2. **Scope the review.** Point at the risky subtree and say what matters:
   ```bash
   strix -n -t ./services/api --max-budget 15 \
     --instruction "Focus on the authorization layer in src/auth and every route under src/routes/admin. Multi-tenant app: tenant id comes from the JWT. Flag any query that filters by object id without also filtering by tenant."
   ```
   Tenancy model, trust boundaries, and which inputs are attacker-controlled are things the agents cannot infer reliably — tell them.

## Reviewing a pull request instead of the whole repo

For diff-scoped review of a branch or PR (and blocking merges on findings), use **ci-security-scanning-with-strix** — it covers diff scoping, PR comments, and SARIF upload to GitHub code scanning. The managed platform can also review PRs directly via API (**managed-pentesting-with-strix**).

## Read the results

In `strix_runs/<run>/`: `penetration_test_report.md` (start here), `vulnerabilities/*.md` (one per finding, with PoC and remediation), `vulnerabilities.json` / `.csv`, `findings.sarif` (upload to code scanning), `run.json`.

Before reporting to the user, open each finding and check the PoC actually demonstrates impact. Report file and line alongside the exploit so the fix is obvious.

Exit `0` means nothing exploitable was proven in what was analyzed — not that the codebase is clean. Check `run.json` status and cost against `--max-budget`, and note which paths went unreviewed if the run was capped.

## Complementary tooling

This is exploit-validated review, not an exhaustive inventory. Keep a dependency scanner (SCA) and secret scanning in place for complete coverage of known-CVE dependencies and committed credentials; use this for the logic, authorization, and injection bugs those tools structurally cannot find.

## Fix and verify

Hand results to **fix-security-vulnerabilities-with-strix**: patch the root cause (the shared authorization helper, not the one route), then re-run Strix to prove the exploit no longer works.

<!-- /vendor-file -->

<!-- vendor-file: fix-security-vulnerabilities-with-strix/SKILL.md -->
---
name: fix-security-vulnerabilities-with-strix
description: Fix security vulnerabilities found by a Strix pentest (open-source CLI or app.strix.ai cloud) — triage by severity, patch the root cause rather than the symptom, and re-run Strix to prove each fix actually closes the exploit. Handles injection, XSS, SSRF, broken access control, IDOR, and other validated findings. Use after a Strix scan reports findings, or when the user asks to remediate, patch, or fix security issues from a strix_runs report, vulnerabilities.json, findings.sarif, or a cloud scan.
license: Apache-2.0
metadata:
  author: usestrix
  homepage: https://docs.strix.ai
---

# Fix Strix findings and verify

Turn validated Strix findings into minimal, correct fixes — and prove they work by re-scanning.

## 1. Triage

Get the findings from wherever the scan ran:

- **OSS CLI** — artifacts in `strix_runs/<run-name>/`:
  - `vulnerabilities/*.md` — one finding per file: description, severity, PoC steps or script, affected code locations, remediation guidance.
  - `vulnerabilities.json` — the same findings as JSON (ids, severity, CWE/CVE, `code_locations` with `fix_before`/`fix_after` suggestions when available).
- **Cloud (app.strix.ai)** — pull findings with the CLI: `strix cloud vulns list --scan-id <scan-id> --json` (or `strix cloud scans get <scan-id> --json | jq '.vulnerabilities'`, or `strix cloud vulns list --severity critical` org-wide). Each finding carries `severity, cwe, endpoint, method, impact, technical_analysis, poc_description, poc_script_code` and, for code findings, `code_file`/`code_diff`/`code_before`/`code_after`. After a fix is verified, mark it with `strix cloud vulns update <id> --status fixed`. See the **managed-pentesting-with-strix** skill for `strix cloud login` and scopes.

Order work by severity: critical → high → medium → low. Every Strix finding was validated with a working proof-of-concept, so do not dismiss findings as false positives without re-testing the PoC yourself.

## 2. Fix

For each finding:

1. Reproduce it with the PoC from the finding file when feasible.
2. Fix the root cause, not the specific payload (parameterize every query instead of blocking one string, and enforce authorization in the handler instead of hiding the endpoint).
3. Prefer the framework's built-in defense (ORM parameterization, template auto-escaping, CSRF middleware, centralized authz) over ad-hoc sanitization.
4. Keep the diff minimal and apply the repo's existing patterns. Finding files often include `fix_before`/`fix_after` snippets — use them as a starting point, not verbatim.

Common finding classes and expected fixes: injection → parameterization/escaping at the sink; IDOR/broken access control → object-level authorization checks; SSRF → allowlist + block internal ranges; XSS → context-aware output encoding + CSP; secrets exposure → rotate the secret AND remove it from code/history; auth issues → fix the server-side check (never client-side).

## 3. Verify by re-running Strix

After fixing, re-scan scoped to the fixed area and confirm the finding is gone. Verify in whichever environment you scanned (or both):

**OSS CLI:**
```bash
# Re-test just the changed files (fast). Resolve the repo's real default
# branch instead of assuming origin/main (many repos use master/develop).
# Avoid the current branch's own upstream as the base — its merge base with
# HEAD would be HEAD, giving an empty diff and a falsely clean result.
DIFF_BASE=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)
# origin/HEAD can be a dangling symbolic ref — keep it only if its target exists.
git rev-parse --verify --quiet "$DIFF_BASE" >/dev/null 2>&1 || DIFF_BASE=""
if [ -z "$DIFF_BASE" ]; then
  for b in origin/main origin/master origin/develop; do
    git rev-parse --verify --quiet "$b" >/dev/null && DIFF_BASE="$b" && break
  done
fi
# No silent fallback: a guess like HEAD~1 would cover only the last commit of a
# multi-commit fix branch. If no base resolves, ask the user for the base branch
# (or use the focused --instruction verification below, which needs no diff base).
[ -n "$DIFF_BASE" ] || { echo "Set DIFF_BASE to the branch your fix will merge into." >&2; exit 1; }
strix -n -t ./ --scan-mode quick --scope-mode diff --diff-base "$DIFF_BASE" --max-budget 5

# Or re-test with the original finding as focus (no diff base needed)
strix -n -t ./ --instruction "Verify the SQL injection in app/api/search.py is fixed. Original PoC: <poc>" --max-budget 5
```
Exit codes: `2` = findings remain (read the new `strix_runs/<run>/vulnerabilities/` and iterate); `0` = clean **for what was analyzed**. Before trusting a `0`, confirm the run wasn't cut short — check `run.json` for a completed status and compare its `llm_usage.cost` with `--max-budget`: a hard budget stop leaves `status: "stopped"`, but a run that wrapped up on a budget warning records `"completed"` with partial coverage. Give verification enough budget to finish, and prefer re-running the specific PoC as the ground-truth signal.

**Cloud:** rerun with the same config and re-poll, then confirm the finding no longer appears:
```bash
new_id=$(curl -sS "$BASE/scans/$scan_id/rerun" "${auth[@]}" -X POST | jq -r .scan_id)
# poll GET /scans/$new_id until completed, then check its vulnerabilities[]
```
Or, if the cloud scan came from a repo/PR, trigger a fresh PR review on the fix branch (`POST /pr-reviews/start`). The platform also retests a single finding directly: `POST /api/v1/vulnerabilities/{vulnerabilityId}/retest`.

- Also re-run the PoC manually when it is a simple request/script — fastest signal.
- Run the project's own test suite to make sure the fix does not break behavior.

## 4. Report

Summarize per finding: severity, root cause, fix applied (file:line), verification result (re-scan clean / PoC no longer reproduces). Never include live secrets in the report; if a secret leaked, state that rotation is required.

<!-- /vendor-file -->

<!-- vendor-file: managed-pentesting-with-strix/SKILL.md -->
---
name: managed-pentesting-with-strix
description: Run a managed pentest of a web app, API, repository, or local workspace on the app.strix.ai platform with the `strix cloud` CLI or REST API — no local Docker or LLM key needed. Safely review and upload local source, register assets, launch and poll scans, triage vulnerabilities, export SARIF, download compliance reports, start PR reviews, buy credits, and set up schedules or webhooks. Use for managed, continuous, scheduled, team-tracked, or sandboxed-agent security testing.
license: Apache-2.0
metadata:
  author: usestrix
  homepage: https://docs.app.strix.ai
---

# Strix Cloud (managed, no local infra)

Use this when you want Strix's autonomous pentesting **without running Docker or an LLM yourself** — the scan runs on Strix's infrastructure and results are tracked in a team dashboard. This is the right choice in sandboxed/hosted agent and CI environments, for teams, and for scheduled/continuous testing (downloadable PDF/DOCX reports are an Enterprise-plan feature). For fully local, free, air-gapped, or BYO-LLM runs, use the open-source CLI in the **penetration-testing-with-strix** skill instead — both share the same engine and SARIF output, so you can mix them.

There are two equivalent interfaces. Prefer the CLI:

- **`strix cloud` CLI** — every REST operation has a command in the form `strix cloud <resource> <verb>`. Install with `curl -sSL https://strix.ai/install | bash`. Run `strix cloud` to list all resources and `strix cloud <resource> help` (or `-h`) to list a resource's verbs; a bare resource with a safe read operation runs its documented default.
- **REST API** — base URL `https://app.strix.ai/api/v1`, `Authorization: Bearer <token>` on every request. Full reference: **[docs.app.strix.ai](https://docs.app.strix.ai)** · agent index: `https://docs.app.strix.ai/llms.txt` · OpenAPI: `https://docs.app.strix.ai/openapi.json`.

The CLI is equally usable by agents and people. Output is complete JSON when stdout is not a terminal, or when you pass `--json`; terminal tables favor names, branches, lifecycle states, and numbered selectors. Human lists retain the selectors needed by follow-up commands but omit internal organization/user IDs; a selector too long for the compact table is repeated losslessly in a copyable block. Paginated lists print the next `--page` or `--offset`, and detail views preserve useful prose within a safe terminal bound; use `--json` for the complete record. Token lists label credentials as active, expired, or revoked. Binary downloads are the exception: redirect raw bytes intentionally, or use `--output FILE --json` to write the file and receive structured metadata. There are no interactive prompts when stdin is not a terminal. Exit codes: `0` success, `1` request/runtime error, `2` invalid usage, `4` authentication or plan limit, `5` payment required.

Every resource group with a safe read operation has a useful default action, and `-h` or `help` always shows its verbs. Native tab completion includes resources, verbs, flags, workspace commands, and local paths:

```bash
source <(strix completions zsh)       # current zsh session
source <(strix completions bash)      # current bash session
strix completions fish | source       # current fish session
```

Write commands take request fields as flags. Every write command also accepts one JSON object with `--data`, which is the way to send fields that have no flag:

```bash
strix cloud scans start --data '{"engagement_type":"code_review"}'   # literal JSON
strix cloud scans start --data @request.json                         # read a file
cat request.json | strix cloud scans start --data -                  # read standard input
```

The platform enforces plan and role limits, and the CLI passes the platform message through. Report downloads need the Enterprise plan. Schedules need the Pro plan. Billing writes need an admin token. A blocked command exits with code `4`.

## Setup: sign in

Run the device sign-in. It creates the user's account and workspace on first use and stores a personal API token in `~/.strix/platform-auth.json`:

```bash
strix cloud login
# Non-interactive least-privilege example:
strix cloud login --scopes scans:read scans:write uploads:write billing:read vulnerabilities:read assets:read assets:write
# Or use a stable named profile:
strix cloud login --scope-profile recommended
```

The user approves the sign-in in the browser. With `--scopes` (and optionally `--workspace <name-or-id>`) there are no terminal prompts, so the command works from a non-interactive agent shell. In an interactive terminal without flags, the CLI offers a workspace picker and scope presets (Recommended, Full access, Minimal, Custom). Recommended covers ordinary scans, source uploads, workspace switching, and user-approved credit top-ups; it excludes `tokens:write`, which must be requested explicitly when credential management is required. Use explicit scopes for a narrower automation token.

- `strix cloud whoami` is the fast local status. `strix cloud session --json` verifies the remote device session; `strix cloud session scopes` shows both effective access and the immutable login ceiling.
- `strix cloud logout` revokes the remote session before removing the local token. On a network or server failure it keeps the token so the user can retry; `--local-only` deliberately skips revocation.
- Every other `strix cloud` command uses the stored token automatically. `--token <token>` or `STRIX_API_TOKEN` is a stateless per-command override and never overwrites the stored account. For an override that is itself a CLI session, also pass `--workspace-id` or set `STRIX_WORKSPACE_ID`.
- Never hardcode, log, or commit the token. Store it in an env var or the CI secret store.
- **Scopes (least-privilege):** assign only what the integration needs and rotate regularly:

  | Scope | Grants |
  |---|---|
  | `scans:read` / `scans:write` | list/read/report scans · create/rerun/cancel scans |
  | `vulnerabilities:read` / `:write` | read findings · update status & notes |
  | `assets:read` / `:write` | read domains/repos · register/update them |
  | `schedules:read` / `:write` | read schedules · create/trigger recurring scans |
  | `pr_reviews:write` | trigger PR security reviews |
  | `webhooks:read` / `:write` | manage webhook subscriptions |
  | `uploads:write` | upload local source or documents for a scan |
  | `organizations:read` | read organization details (listing/switching the signed-in user's workspaces needs no API scope) |
  | `organizations:write` | create/update workspaces (admin) |
  | `tokens:write` | create/revoke ordinary API tokens (not needed to manage the current CLI session) |
  | `knowledge:read` / `:write` | read/update organization knowledge |
  | `audit:read` | read/export the Enterprise audit log |
  | `billing:read` / `billing:write` | read credit balance & auto top-up settings · buy credits (admin) |

HTTP errors map to messages and exit codes: `401` bad/expired token (exit `4`), `402` out of credits (exit `5`), `403` scope/plan-tier limit (exit `4`), `422` validation error (exit `1`).

Create a time-limited automation token with `strix cloud tokens create`. Use
`--rbac-scopes` to restrict it to target IDs, tags, or business units; the value is a
JSON array of `{ "type": "target|tag|business_unit", "value": "..." }` objects:

```bash
strix cloud tokens create --type service --name staging-ci \
  --expires-at 2026-12-31T23:59:59Z \
  --scopes scans:read scans:write \
  --rbac-scopes '[{"type":"tag","value":"staging"}]'
```

The token secret is returned once. Store it directly in a secret manager and do not
print or commit it. `--expires-at` and `--expires-in-days` are mutually exclusive.

## 0. Credits & top-ups

Non-Enterprise scans consume org credits. Enterprise engagements are plan-included and do not debit the wallet. Check the balance before a scan (`billing:read`):

```bash
strix cloud credits
```

When the balance is too low, buy credits with `strix cloud billing topup` (`billing:write`, admin token). The server answers the first request with **HTTP 402 and a machine-payment challenge** (Stripe Machine Payments Protocol). The CLI pays the challenge with the Stripe Link wallet client when Node.js is available — the user approves the spend in the [Link app](https://link.com/agents). The response returns the receipt (`credits_granted`, `duplicate`, `reference`) and the new balance.

A default-tier source-only code review currently starts at 60 credits. Source uploads are not free: they launch an ordinary `code_review` and use the same deterministic scope estimator. The service checks the full balance before launch, reserves credits atomically only after validation succeeds, and does not create or charge a rejected scan. Retests and Enterprise scans are exempt.

```bash
strix cloud billing topup --credits 20 --yes   # explicit approval; skips the TTY prompt
strix cloud billing topup --credits 20 --no-pay   # print the 402 challenge without paying
```

The default payment path is the Stripe Link wallet. When no wallet is connected, an interactive `strix cloud billing topup` starts the Link sign-in for the user and prints the verification link. The user approves the connection one time in the Link app, and then approves each payment there. No keys or variables are necessary. In a non-interactive process, the command stops and tells the user to connect the wallet at [link.com/agents](https://link.com/agents) or to use the hosted checkout link.

In a non-interactive agent or CI process, payment never proceeds unless the command includes `--yes`. Show the challenge or estimated spend to the user and obtain approval before adding it. `--no-pay` always stops after printing the challenge.

If the user does not want a wallet, create a hosted checkout link with `strix cloud billing subscribe --plan strix_top_up` and give the link to the user. The user pays in the browser.

Automatic top-ups (admin): `strix cloud billing auto-topup` shows the setting. Enable it with:

```bash
strix cloud billing auto-topup update --enabled --topup-credits 20 --monthly-cap-credits 200
```

An omitted `--monthly-cap-credits` keeps the stored cap. Pass `--no-monthly-cap` to remove the cap.

### Workspaces and account setup

Manage workspaces with a personal token from `strix cloud login`:

```bash
strix cloud workspaces list                    # numbered name/role/current list
strix cloud workspaces create --name "My Team"  # admin + organizations:write
strix cloud workspaces use 2                   # displayed number, exact name, or ID
strix cloud workspace use "My Team"            # singular `workspace` alias also works
strix cloud session scopes                     # effective scopes + consent ceiling
strix cloud session scopes set minimal         # narrow the session
strix cloud org members invite --email dev@example.com --role analyst
```

`workspaces use` retargets the current personal token to a workspace the user already belongs to and stores the updated workspace metadata; the bearer secret and expiry stay unchanged. It does not reprompt during ordinary switches: the server preserves the chosen profile, enforces the immutable login ceiling, and caps effective scopes by the target role. Use `--scope-profile` or `--scopes` to narrow within that ceiling; broader consent requires `strix cloud login` again. The CLI pins each process to the workspace it started in, so concurrent shells fail with a recoverable conflict instead of silently crossing organizations.

### Handoffs a person must finish

Four steps end at the user. The command creates the link or the record and prints it. Strix opens the browser only in an interactive terminal. Pass `--no-browser` to print the URL only.

```bash
strix cloud billing subscribe --plan strix_cloud # hosted checkout page for the Cloud plan
strix cloud billing portal                       # billing portal for the card and the plan
strix cloud integrations install github          # GitHub App or Slack installation page
strix cloud domains verify <domain-id>           # DNS record to add, then run it again
```

Give the printed URL or DNS record to the user and wait. Do not claim that the payment, the installation, or the DNS change is complete. Confirm the result afterwards with `strix cloud credits`, `strix cloud integrations list`, or `strix cloud domains list`. All four commands need an admin token, except `domains verify`, which needs `assets:write`.

### Organization knowledge

Agents can manage the organization knowledge base without the dashboard (`knowledge:read` / `knowledge:write`):

```bash
strix cloud knowledge list --search authentication
strix cloud knowledge add --title "Authentication" --content "Staging uses SSO."
strix cloud knowledge update <document-id> --content "Staging uses SSO and TOTP."
strix cloud knowledge delete <document-id>
strix cloud knowledge policies add --key staging-only --content "Never test production."
strix cloud knowledge policies delete staging-only
strix cloud knowledge repos entries usestrix/strix
```

Knowledge policy writes require an admin token. Repository names are passed as normal `owner/name` values; the CLI handles URL encoding. The `costs` and `llm-settings` commands target on-prem installations and return `404` on app.strix.ai.

## 1. Register the target as an asset

Scans run against **registered assets**, not raw URLs. Register once, then reuse the returned UUID.

```bash
# Domain (black-box / live target). Requires domain verification before external scanning.
# --asset-type must be one of: web_app | api | attack_surface.
strix cloud domains add --domain staging.example.com --asset-type web_app

# Repository (white-box / code review). `full_name` is "owner/name".
strix cloud repos add --data '{"full_name":"org/app","provider":"github"}'
```

Look up existing assets instead of re-adding: `strix cloud domains list`, `strix cloud repos list` (both `assets:read`).

## 2. Launch a scan

`strix cloud scans start` (`scans:write`). Provide at least one target with `--domain-ids`, `--repository-ids`, or `--internal-targets` (internal infra needs a network connector — see docs).

```bash
strix cloud scans start \
  --engagement-type live_test \
  --domain-ids <domain-uuid> \
  --focus "IDOR, auth bypass, SSRF" \
  --context "Staging. Test account creds are configured as a test user." \
  --notify-on-completion
```

Useful flags (each maps to a `CreateScanRequest` field):

| Flag | Purpose |
|---|---|
| `--engagement-type` | `live_test` (default), `code_review`, `internal_infra`, `compliance_pentest` |
| `--domain-ids` / `--repository-ids` / `--internal-targets` | targets (at least one) |
| `--domain-paths` / `--repository-branches` | narrow to specific paths / branches (JSON maps) |
| `--credentials` | authenticated scanning, incl. `mfa_method` (`totp`/`email_otp`/…) + `totp_secret` (JSON list) |
| `--headers` | extra target HTTP headers as a JSON array of header objects |
| `--focus` / `--concerns` / `--context` | free-form strings that steer the agents |
| `--upload-ids` | attach uploaded source/docs archives for white-box context |
| `--notify-on-completion` / `--notification-emails` | email when done |

Without `--source`, the response is `{ scan_id, title, status }` with `status` = `pending`.
Local-source success wraps that platform response as
`{ source, upload_id, scan: { scan_id, title, status } }`, so automation can retain the exact
approved manifest and staged-upload identifier alongside the created scan.

### Scan a local workspace in the cloud

For an agent or CI workflow, bind approval to the exact source snapshot that was reviewed. Run
the dry run with the intended source-selection flags, review the manifest and selected paths,
and capture `source.archive_sha256`. Then repeat the same `--source`, every `--exclude`, and
any `--include-hidden`, `--include-sensitive`, or `--include-archives` flags with
`--approve-sha256`:

```bash
strix cloud scans start --source . --exclude 'private/' --dry-run --show-files --json
# After reviewing the output, capture its source.archive_sha256 value:
SOURCE_SHA256="<reviewed source.archive_sha256>"
# Repeat every source-selection flag unchanged; a source-only scan infers code_review.
strix cloud scans start --source . --exclude 'private/' \
  --approve-sha256 "$SOURCE_SHA256" --wait
```

The CLI rebuilds the archive and refuses the upload if its SHA-256 no longer matches. `--yes`
has deliberately narrower semantics: it approves only the snapshot built during that one
invocation. Use it for a deliberate human or one-shot approval, not as the second half of a
digest-bound agent/CI review. Without a TTY, a source upload requires either matching
`--approve-sha256` approval or `--yes`; an interactive terminal can instead show the summary,
the selected filenames when `--show-files` is set, and a `[y/N]` confirmation for its current
snapshot.

The default selection is privacy-conscious: in a Git worktree it includes tracked files plus untracked files that are not ignored; it honors `.gitignore`, excludes every hidden path component, always excludes `.git`, symlinks, dependencies/build output, secret-like filenames, and nested archives. Add project exclusions to `.strixignore` (one exclude glob per line) or repeat `--exclude GLOB`; a trailing slash such as `private/` excludes that directory subtree.

The client refuses more than 20,000 files, a file over 25 MiB, more than 250 MiB expanded, or a ZIP over 50 MiB. The service then stream-inflates the ZIP and independently rejects malformed or unsupported entries, unsafe paths, too many entries, oversized entries, excessive expanded data, and oversized compressed input, so an untrusted client cannot bypass the ZIP-bomb controls by forging metadata.

Only use `--include-hidden`, `--include-sensitive`, or `--include-archives` after the dry-run manifest shows that the scan needs them. Hidden and sensitive files are separate opt-ins: for example, including `.env` requires both `--include-hidden` and `--include-sensitive`.

The CLI removes its private temporary local archive after every invocation. Once a remote
upload is staged, a definitive scan rejection causes the CLI to delete it. A network failure,
`5xx` response, malformed success response, or interruption after scan launch begins is
ambiguous—the platform may have accepted the scan—so the CLI retains the upload and returns
its `upload_id` with `launch_outcome_unknown: true`. If an automatic deletion attempt cannot
be confirmed, it instead returns the retained `upload_id` with `cleanup_unknown: true`.
Before retrying, run `strix cloud scans list` to avoid a duplicate scan or charge. If no scan
is linked to the retained upload, remove it with `strix cloud uploads delete UPLOAD_ID`;
linked uploads cannot be deleted.

With no explicit type, source alone infers `code_review`. Any domain target wins and infers `live_test`, so source plus a deployed domain is the normal white-box live-test workflow. Pass `--engagement-type` when you need to override the inference.

## 3. Wait for completion

Pass `--wait` to `scans start` to poll until the scan reaches a final state, or poll yourself with `strix cloud scans get <scan-id>` (`scans:read`). Bound automation with `--wait-timeout SECONDS`; timeout exits cleanly without cancelling the remote scan. Status flow: `pending → running → completed` (or `failed` / `cancelled`). Scans take minutes to hours — poll on an interval, do not block indefinitely.

## 4. Read findings

The scan-detail response includes `executive_summary`, `methodology`, `recommendations`, a `findings` severity roll-up, and a `vulnerabilities[]` array. Each vulnerability carries `title, severity, status, cvss, cwe, endpoint, method, impact, technical_analysis, poc_description, poc_script_code`, and (for code findings) `code_file`/`code_diff`/`code_before`/`code_after`.

```bash
strix cloud scans get <scan-id> --json \
  | jq '["critical","high","medium","low","info"] as $order
       | .vulnerabilities
       | sort_by(.severity as $s | $order | index($s))
       | .[] | {title, severity, endpoint, cwe}'
```

Cloud severities are `critical | high | medium | low` and statuses are `open | in_progress | snoozed | fixed | ignored | not_affected`. Sort by an explicit severity order rather than `sort_by(.severity)`, which sorts alphabetically (critical, high, low, medium).

Org-wide triage across scans: `strix cloud vulns list --severity critical` (`vulnerabilities:read`, and it also filters by `--status`, `--scan-id`, and more). Update triage state with `strix cloud vulns update <id> --status fixed`. To remediate, hand off to the **fix-security-vulnerabilities-with-strix** skill.

## 5. Export & report

```bash
# SARIF 2.1.0 for GitHub code scanning / ASPM ingestion
strix cloud scans sarif <scan-id> --output findings.sarif

# Report. Formats: technical (default) | retest | attestation | executive_summary
# Types: pdf (default) | docx
# Any report download requires the Enterprise plan. Formats beyond `technical`,
# DOCX, and white-label branding are Enterprise-only too. Scan must be completed.
strix cloud scans report <scan-id> --format technical --type pdf --output strix-report.pdf
```

Downloads refuse to replace a file unless `--force` is explicit. Enterprise audit logs can be streamed as JSON or exported without trying to JSON-decode the body:

```bash
strix cloud audit list --format csv --all --output audit.csv
strix cloud audit list --format ndjson --all --output audit.ndjson
```

## 6. PR reviews

Trigger an automated security review of a pull request (`pr_reviews:write`). Read the repository's `provider` and `installation_id` with `strix cloud repos list`; both identify the installed source-control integration. The results appear as PR comments and in the dashboard:

```bash
strix cloud pr-reviews start \
  --provider github \
  --installation-id <installation-id> \
  --repository-full-name org/app \
  --pr-number 123
```

List/inspect with `strix cloud pr-reviews list` and `strix cloud pr-reviews get <id>`. Repo-level PR-review behavior is configured with `strix cloud pr-reviews settings`.

## 7. Continuous testing (schedules & webhooks)

- **Schedules** (`schedules:write`, Pro plan): `strix cloud schedules create` makes recurring scans, and `strix cloud schedules trigger <id>` runs one on demand — the managed equivalent of a cron-driven CLI loop.
- **Webhooks** (`webhooks:write`): `strix cloud webhooks create` subscribes to pentest/vulnerability lifecycle events such as `scan.completed` and `vulnerability.created` to push results into Slack, ticketing, or your own pipeline instead of polling.

See the schedules and webhooks sections at [docs.app.strix.ai](https://docs.app.strix.ai) for payloads.

Network connectors are Enterprise-only. `strix cloud connectors create` may return a one-time enrollment command containing credentials; do not paste it into logs, and request it with `--include-command` only when the user is ready to install it. Browser checkout, source-control installation, DNS verification, connector installation, chat sharing, and publishing SARIF to an external provider are user handoffs or explicit external mutations—prepare the command/link, then obtain the appropriate approval before completing them.

## Safety

Only scan assets the user's organization owns or is authorized to test. External domain scans require verification (DNS/file/meta-tag) enforced by the platform — do not try to bypass it.

<!-- /vendor-file -->

<!-- vendor-file: owasp-top-10-testing/SKILL.md -->
---
name: owasp-top-10-testing
description: Test an application against the OWASP Top 10 with Strix — autonomous AI agents that attempt real exploits for each category of the current OWASP Top 10:2025 (broken access control including SSRF, security misconfiguration, software supply chain failures, cryptographic failures, injection, insecure design, authentication failures, integrity failures, logging and alerting failures, mishandling of exceptional conditions) and report only what they could actually prove, mapped back to the category with a proof-of-concept. Also covers the OWASP API Security Top 10 (2023). Use when the user asks for an OWASP Top 10 assessment, OWASP compliance testing, or a security review mapped to OWASP categories.
license: Apache-2.0
metadata:
  author: usestrix
  homepage: https://docs.strix.ai
---

# Test against the OWASP Top 10

The OWASP Top 10 is a taxonomy of risk categories, not a test suite — "OWASP Top 10 testing" means exercising each category against the real application and reporting what's actually exploitable. Strix's agents do the exploitation; this skill covers running it category-by-category and reporting coverage honestly.

**Use the current edition: [OWASP Top 10:2025](https://owasp.org/Top10/)** (8th installment, superseding 2021). Ask the user before targeting an older edition — some compliance checklists still reference 2021, and a report labelled with the wrong edition is misleading. Key differences from 2021: **SSRF is folded into A01**, **A03 Software Supply Chain Failures** expands the old "Vulnerable and Outdated Components", and **A10 Mishandling of Exceptional Conditions** is new; A02 Security Misconfiguration moved 5→2.

Install, LLM setup, and the managed-cloud alternative: **penetration-testing-with-strix**. For a run with no Docker and no LLM key, the same binary drives the managed platform: `strix cloud login`, then `strix cloud scans start ...` (details in **managed-pentesting-with-strix**).

## What is and is not testable by an agent

Be straight with the user about this — claiming a clean sweep of all ten is misleading.

| Category (2025) | Coverage |
|---|---|
| A01 Broken Access Control (incl. SSRF) | **Strong** — cross-user/tenant access, privilege escalation, IDOR, and SSRF (including blind, via out-of-band callbacks) are all exploit-validated. Needs two accounts plus a privileged one to prove the authorization half. |
| A02 Security Misconfiguration | **Strong** — debug endpoints, verbose errors, permissive CORS, missing hardening, default credentials, exposed admin surfaces. |
| A03 Software Supply Chain Failures | **Partial** — version fingerprinting, and vulnerable/outdated dependency review when source is supplied. Build-system and distribution-infrastructure compromise (the broader half of this category) is out of scope for a runtime scan — pair with SCA plus build-provenance controls. |
| A04 Cryptographic Failures | **Partial** — transport config, unencrypted data in transit, secrets and tokens leaked in responses. At-rest crypto and key management need source or infra review. |
| A05 Injection | **Strong** — SQL/NoSQL/command/template injection and XSS, exploit-validated. |
| A06 Insecure Design | **Partial** — business-logic abuse (price/quantity tampering, workflow skipping, race conditions) is found where reachable; design intent still needs human review and threat modelling. |
| A07 Authentication Failures | **Strong** — auth bypass, weak session/token handling, password-reset and MFA flaws. |
| A08 Software or Data Integrity Failures | **Partial** — insecure deserialization and unsigned-update paths where reachable; CI/CD trust boundaries are not runtime-testable. |
| A09 Security Logging & Alerting Failures | **Not testable from outside** — requires reviewing the logging and alerting pipeline. State this rather than reporting it as passed. |
| A10 Mishandling of Exceptional Conditions | **Partial** — agents actively probe error handling and fail-open behavior (malformed input, forced errors, race and timeout conditions) and report what leaks or bypasses a control; exhaustive coverage of internal error paths needs source review. |

For APIs, run the same exercise against the **OWASP API Security Top 10 (2023)** — API1 BOLA, API3 Broken Object Property Level Authorization (2019's excessive data exposure + mass assignment merged), API5 broken function-level authorization — using the **api-security-testing** skill.

## Run it

Maximum category coverage comes from giving the agents both the source and a running instance, plus credentials at two privilege levels:

```bash
strix -n \
  -t https://github.com/org/app \
  -t https://staging.example.com \
  --scan-mode deep --max-budget 30 \
  --instruction "OWASP Top 10:2025 assessment. Cover every category systematically and map each finding to its 2025 category id.
Accounts: userA@example.com/<pw> (org 1), userB@example.com/<pw> (org 2), admin@example.com/<pw>.
Prioritise A01 (cross-org access, privilege escalation, SSRF), A02, A05, A07, A10.
Out of scope: /billing/*, outbound email."
```

- `--scan-mode deep` matters here: systematically walking ten categories is not a quick scan.
- Without a second account, A01 results are structurally incomplete — say so in the report rather than leaving it implied.
- Need an auditor-facing PDF? Run it through the managed platform and pull the technical report (**managed-pentesting-with-strix**).

## Report honestly

From `strix_runs/<run>/`, group `vulnerabilities/*.md` by category and state, per category: what was attempted, what was proven, and what could not be assessed (A09 always; A03/A04/A06/A08/A10 partially). Label the report with the edition used. Verify each PoC yourself before it goes in front of the user.

A `0` exit code means nothing exploitable was proven **in what was analyzed** — check `run.json` status and cost against `--max-budget`; a budget-capped run is not a completed assessment.

## Then fix and re-test

Remediate with **fix-security-vulnerabilities-with-strix** and re-run to prove each exploit is closed. For ongoing coverage as the app changes, gate pull requests using **ci-security-scanning-with-strix**.

<!-- /vendor-file -->

<!-- vendor-file: penetration-testing-with-strix/SKILL.md -->
---
name: penetration-testing-with-strix
description: Pentest a web app, API, codebase, repository, URL, domain, or IP with Strix — autonomous AI penetration testing that exploits and proves vulnerabilities (OWASP Top 10 and beyond — injection, XSS, SSRF, auth/access-control flaws, IDOR, business logic) instead of just flagging them. Runs self-hosted with the open-source CLI or via the managed app.strix.ai cloud, and returns validated findings with proof-of-concept exploits (Markdown, JSON, CSV, SARIF). Use when the user asks to pentest, hack, security-scan, security-audit, or find vulnerabilities in an app, API, website, or repo.
license: Apache-2.0
metadata:
  author: usestrix
  homepage: https://docs.strix.ai
---

# Run a Strix pentest

Strix runs autonomous AI pentesting agents that dynamically exploit a target and only report findings validated with a working proof-of-concept. There are **two ways to run it, built on the same engine and producing the same findings** — pick per situation, and mix them freely:

- **Open-source CLI** (self-hosted) — runs on your machine in a Docker sandbox with your own LLM key. Free, fully local, BYO-LLM, air-gap capable. Docs: [docs.strix.ai](https://docs.strix.ai).
- **Managed cloud** — runs on Strix's infrastructure, driven from the same CLI (`strix cloud ...`) or the REST API at `https://app.strix.ai/api/v1`. No Docker, no LLM key, no local compute; adds team dashboards, scheduling, PR reviews, downloadable PDF/DOCX reports (Enterprise plan), and internal-network connectors. Docs: [docs.app.strix.ai](https://docs.app.strix.ai). Full workflow in the **managed-pentesting-with-strix** skill.

## Which one? (decide, do not default)

Choose honestly based on the situation — neither is "better":

| Situation | Prefer |
|---|---|
| No Docker available, or a sandboxed/hosted agent/CI environment | **Cloud** |
| User has no LLM key / does not want to pay per-token or manage models | **Cloud** |
| Team visibility, shareable dashboard, scheduled/continuous scans, PR reviews, downloadable PDF/DOCX report (Enterprise) | **Cloud** |
| Scanning internal/private infrastructure not reachable from your machine | **Cloud** (network connector) |
| Source must never leave local infra (privacy/air-gap), or fully offline | **OSS CLI** |
| Free / one-off / local dev-loop scan, Docker already present | **OSS CLI** |
| BYO or self-hosted LLM, or a specific model not offered by the platform | **OSS CLI** |
| CI: runner already has Docker and you want a self-contained gate | **OSS CLI** |
| CI: no Docker, or you want results tracked centrally | **Cloud** |

**Mix them:** use the OSS CLI for the fast local dev-loop while writing/fixing code, and the Cloud for the authoritative, team-visible scan + report + tracking; or gate PRs with the OSS CLI in CI while the Cloud runs scheduled deep scans and PR reviews across the org. Both emit the same SARIF 2.1.0, so findings line up across environments.

If unsure and the user has (or will create) an app.strix.ai account, prefer **Cloud** — it avoids all local-infra friction. If they want zero signup / full local control, use the **OSS CLI**.

---

# Option A — Open-source CLI (self-hosted)

## Prerequisites

1. **Docker running** — check with `docker info`. The first scan pulls the sandbox image automatically.
2. **Strix installed** — check with `strix --version`. Install if missing:
   ```bash
   curl -sSL https://strix.ai/install | bash   # or: pipx install strix-agent
   ```
3. **LLM configured** — two environment variables:
   ```bash
   export STRIX_LLM="openrouter/z-ai/glm-5.3"      # any LiteLLM model id (openai/..., anthropic/..., openrouter/...)
   export LLM_API_KEY="<provider api key>"
   ```
   Ask the user for these if unset. Never hardcode or commit keys.

## Running a scan

Always use `-n` (non-interactive/headless) — the default TUI blocks agents. Always set `--max-budget` unless the user says otherwise.

```bash
# Local code (white-box)
strix -n -t ./ --scan-mode standard --max-budget 10

# Deployed app / API (black-box)
strix -n -t https://staging.example.com --max-budget 20

# Repo + deployed app together (best coverage)
strix -n -t https://github.com/org/app -t https://staging.example.com

# Focused testing with credentials or scope hints
strix -n -t https://app.example.com \
  --instruction "Use credentials user@example.com:pass123. Focus on IDOR and auth bypass."

# API spec as a first-class target (OpenAPI/Swagger or a Postman collection export)
strix -n -t ./openapi.yaml -t https://api.staging.example.com

# Many targets from a file, one per line
strix -n --target-list ./targets.txt --max-budget 30

# Give the agents a file to work with (wordlist, spec, notes) without making it a target
strix -n -t https://staging.example.com --workspace-file ./wordlist.txt --max-budget 20
```

A local path passed with `-t` is mounted into the sandbox **writable** — the agents can read and modify it, so point at a clean checkout, not uncommitted work you care about.

Key flags:

| Flag | Meaning |
|---|---|
| `-t, --target` | URL, repo URL, local path, domain, IP, OpenAPI/Postman spec, or `postman://<uuid>`. Repeatable. |
| `--target-list PATH` | File of targets, one per line (`#` comments allowed). Repeatable, combines with `-t`. |
| `-n, --non-interactive` | Headless, exits on completion. Required for agents. |
| `-m, --scan-mode` | `quick` (minutes) / `standard` (~30 min) / `deep` (hours, default). |
| `--instruction` / `--instruction-file` | Credentials, focus areas, scope rules. |
| `--workspace-file PATH[:DEST]` | Copy a file from this machine into `/workspace` before the scan, for a wordlist, a spec, or notes. Repeatable. |
| `--max-budget USD` | Hard LLM spend cap; scan wraps up cleanly at the limit. |
| `--max-turns N` | Per-agent turn cap (default 500). |
| `--fail-on SEVERITY` | Headless only: exit `2` only for findings at or above `critical`/`high`/`medium`/`low`/`info`. Default: any finding. |
| `-r`, `--resume RUN_NAME` | Resume a prior run from `strix_runs/`, with its agent history and targets. Cannot be combined with `-t`. |
| `--scope-mode` | For code targets: `auto` (diff-scope in CI/headless), `diff` (force changed files only), `full` (whole tree). |
| `--diff-base REF` | Branch or commit that `diff` scope compares against. Defaults to the repo's default branch. |

Scans take minutes (`quick`) to hours (`deep`). Run them in the background and poll for completion rather than blocking.

### Exit codes (headless)

- `0` — finished with no validated vulnerabilities **in what was analyzed** (with `--fail-on`, none at or above the threshold; lower ones are still in the artifacts)
- `1` — fatal error (missing env vars, Docker down, bad config)
- `2` — vulnerabilities found (with `--fail-on`, at least one at or above that severity)

A `0` is not proof of full coverage: if `--max-budget`/`--max-turns` is reached before the scan completes, it wraps up early and still exits `0`. When you need assurance the scan finished, give it enough budget and check `strix_runs/<run>/run.json`: a hard budget stop leaves `status: "stopped"`, but an agent that wrapped up early on a budget *warning* still calls `finish_scan` and records `"completed"` — so also sanity-check the run's cost against `--max-budget` and the report's stated coverage before treating a clean result as full coverage.

### Reading results

Artifacts land in `strix_runs/<run-name>/`:

| File | Contents |
|---|---|
| `penetration_test_report.md` | Executive report — read this first. |
| `vulnerabilities/*.md` | One file per validated finding, with PoC and remediation. |
| `vulnerabilities.json` / `vulnerabilities.csv` | All findings as structured JSON / CSV index. |
| `findings.sarif` | SARIF 2.1.0 for GitHub code scanning / ASPM ingestion. |
| `run.json` | Run metadata, status, targets, usage/cost. |

---

# Option B — Managed cloud (no local infra)

The same `strix` binary drives the managed platform. Every command starts with `strix cloud`. Full details — asset registration, source uploads, reports, PR reviews, schedules, webhooks, and billing — are in the **managed-pentesting-with-strix** skill. Minimal flow:

```bash
# 1. Sign in (device flow — the user confirms a code in the browser; this also
#    creates the account and workspace when needed)
strix cloud login

# If you need specific scopes, request them with --scopes:
#   strix cloud login --scopes scans:read scans:write assets:read assets:write \
#     vulnerabilities:read billing:read billing:write

# 2. Register and verify the target domain (verification prints a DNS record for the user)
strix cloud domains add --domain staging.example.com --asset-type web_app
strix cloud domains verify <domain-id>

# 3. Launch and wait
strix cloud scans start --engagement-type live_test --domain-ids <domain-id> --wait

# 4. Read validated findings
strix cloud vulns list --severity critical
```

For a local repository, `strix cloud scans start --source .` uploads the working tree (needs `uploads:write`) and infers a code review. When credits run out, `strix cloud billing topup` starts an agent-payable Stripe challenge — the managed skill covers the payment flow. Output is JSON when stdout is not a terminal, so the commands compose in scripts.

The raw REST API works too (`https://app.strix.ai/api/v1`, org-scoped bearer token — see [docs.app.strix.ai](https://docs.app.strix.ai)). If Docker or local prerequisites are not already satisfied, use this path instead of trying to install infra.

---

## Reporting & next steps

Summarize findings by severity (critical/high/medium/low/info) and include the PoC evidence. To remediate and verify fixes (via either path), use the **fix-security-vulnerabilities-with-strix** skill. To wire scanning into CI/CD, use the **ci-security-scanning-with-strix** skill.

## Safety

Only scan targets the user owns or is authorized to test. The Cloud platform enforces domain verification before external scans; for the OSS CLI, confirm authorization yourself if the target looks like third-party infrastructure.

<!-- /vendor-file -->

<!-- vendor-file: web-app-penetration-testing/SKILL.md -->
---
name: web-app-penetration-testing
description: Pentest a web app or website end to end — black-box testing of a live URL, staging environment, or local dev server that finds and exploits real vulnerabilities (auth bypass, broken access control, IDOR, injection, XSS, SSRF, business logic) and proves each one with a working proof-of-concept instead of a signature match. Runs with Strix, either the self-hosted open-source CLI or the managed app.strix.ai cloud. Use when the user asks to pentest, hack, security-test, or audit their web app, website, web application, or staging site.
license: Apache-2.0
metadata:
  author: usestrix
  homepage: https://docs.strix.ai
---

# Pentest a web application

Black-box (and optionally source-assisted) penetration testing of a running web app with Strix's autonomous agents. Every reported finding is validated with a working exploit, so there are no signature-based false positives to triage.

Install, LLM setup, all CLI flags, and the managed-cloud alternative are covered in the **penetration-testing-with-strix** skill — read it if the target is not a running web app, or if `strix --version` fails. For a run with no Docker and no LLM key, the same binary drives the managed platform: `strix cloud login`, then `strix cloud scans start ...` (details in **managed-pentesting-with-strix**). This skill is the web-app-specific workflow.

## 1. Confirm authorization and scope

Before running anything, establish:

- **The target is the user's** (or they are explicitly authorized to test it). Never pentest a third-party site on a hunch.
- **Which environment.** Prefer staging over production; agents send real exploit payloads and will create/modify data.
- **Out-of-scope paths** — payment flows, mass-email endpoints, admin destructive actions, third-party SSO providers.
- **Credentials.** Most real vulnerabilities live behind login. Without a test account, the agents only ever see the marketing surface.

Ask for anything missing rather than guessing.

## 2. Run the scan

```bash
strix -n -t https://staging.example.com --max-budget 20 \
  --instruction "Test account: qa@example.com / <password>. In scope: /app/*, /api/*. Do not touch /billing or send email. Focus on access control between the two seeded orgs."
```

Notes that matter for web apps specifically:

- **Give it credentials via `--instruction`** (or `--instruction-file` for anything long), including how to log in if the flow is unusual (magic link, SSO, MFA-exempt test user).
- **Two accounts beat one.** Multi-tenant IDOR and broken-access-control bugs — consistently the highest-impact class in web apps — can only be proven when the agent can attempt cross-account access.
- **Add the repo for white-box depth** when you have the source: `-t https://github.com/org/app -t https://staging.example.com` (or a local path). Source access materially improves coverage of business-logic and authorization flaws.
- **Localhost works.** Point at `http://host.docker.internal:3000` (Docker Desktop) so the sandbox can reach a dev server on the host.
- `--scan-mode quick` for a fast dev-loop pass, `standard` (~30 min) for a normal review, `deep` for pre-release assurance. Always set `--max-budget`.

For a hosted run with no Docker/LLM key, or when the user wants a shareable dashboard and an auditor-ready PDF, use the cloud path in **managed-pentesting-with-strix** instead — same engine, same findings.

## 3. Review results

Read `strix_runs/<run>/penetration_test_report.md` first, then per-finding files in `vulnerabilities/`. Each contains the PoC — re-run it yourself to confirm before reporting to the user.

Exit codes: `0` no validated vulns in what was analyzed, `2` vulnerabilities found, `1` fatal error. A `0` is not proof of full coverage — if the budget or turn cap was hit the scan wraps up early, so check `run.json` status and cost against `--max-budget` before calling the app clean.

## 4. Fix and verify

Hand findings to the **fix-security-vulnerabilities-with-strix** skill: patch the root cause, then re-run Strix against the same target to prove the exploit no longer works. Re-testing is the only reliable confirmation a fix landed.

To keep the app tested on every change rather than once, wire Strix into CI with **ci-security-scanning-with-strix**.

<!-- /vendor-file -->

