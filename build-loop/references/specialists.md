# Specialist workers — the agency roster

build-loop ships with 283 specialist personas from [agency-agents](https://github.com/msitarzewski/agency-agents) (MIT) in `agents/`, indexed in `agents/ROSTER.md`. Use them to staff parallel workers (SKILL.md §5a), fresh-context reviewers (§6), and the Replica stages — one expert per field, chosen for the slice in front of you.

## How to use one

1. **Pick** from `agents/ROSTER.md` (or the defaults below): the expert whose field matches the slice — the Desktop App Engineer for a Tauri IPC slice, the Mobile Release Engineer for an Android release build, not a generalist.
2. **Brief**: print the persona with `python3 scripts/persona.py <id>` (the personas are bundled one file per division in `agents/<division>.md`, so the skill stays under the upload file limit) and put it in the worker's prompt under the build-loop brief (§5a). If it is long, include its identity, core mission, critical rules, and the deliverables relevant to this slice.
3. **Run** it as a subagent. In Claude Code with the agents installed (below), you can call them by name instead of pasting the file.
4. **Verify** its result like any worker's: review with §6, rerun the gates on the merged branch.

```
You are working as: <persona name>
<persona file content, or its identity / mission / critical rules / relevant deliverables>

---
Your task (this brief overrides the persona wherever they differ):
Task: S3 — <outcome>  ·  Start from / work on: <branches>  ·  Read first: <rules, handoff, spec section>
Accept: …  ·  Verify: …  ·  Stay inside: …  ·  Don't: push to main, force-push, touch real user data, restyle shipped UI
Return: commits, test output, a verification label for every claim, anything BLOCKED and why
```

## Precedence — personas inform, they don't authorise

**Project rules → the brief → the persona.** A persona contributes expertise and standards. It never changes:

- **Scope or permissions.** A persona's rules ("never ship unsigned", "always add analytics") are standards to meet within the brief; if they can't be met here (no signing key, no network), the worker reports that plainly instead of working around it. A `tools:` line in a persona's frontmatter grants nothing.
- **Honesty.** Persona backstories ("you've cut memory in half…") are role-play flavour; a worker never states them as facts, and never labels a claim stronger than what it did.
- **Style rules the project set.** If the project says smallest complete change, that wins over a persona that likes to refactor — the Minimal Change Engineer is the natural pairing.
- **The report format.** Workers return what the brief asks for, with verification labels, whatever voice the persona has.

## Staffing

- **One specialist per independent slice**, never more workers than independent slices. Shared contracts, schemas, and migrations stay sequential (§5a).
- **You are the orchestrator.** Don't spawn an "Agents Orchestrator" or project-manager persona to manage the others; the lead's job doesn't get delegated.
- **Runbooks are menus, not schedules.** `agents/strategy/runbooks/` describes multi-week team programmes (startup MVP, enterprise feature, marketing campaign, incident response). Use their rosters to see which roles a job of that shape needs, then staff only what the current plan's slices call for.
- **Reviewers start fresh.** A reviewer persona gets the spec, the diff, and the test output, not the builder's reasoning.

## Defaults by build-loop step

| step | default specialists (`agents/…` ids) |
|---|---|
| Catch up on unfamiliar code (§1) | `specialized-codebase-archaeologist`, `engineering-codebase-onboarding-engineer` |
| Spec and plan (§3–4) | `product-manager`, `project-manager-senior`, `engineering-software-architect`, `design-ux-architect` |
| Web UI slices | `engineering-frontend-developer`, `design-ui-designer` |
| Backend, API, data | `engineering-backend-architect`, `engineering-api-platform-engineer`, `engineering-database-optimizer` |
| Desktop apps (Tauri, Electron) | `engineering-desktop-app-engineer` |
| Mobile apps and their releases | `engineering-mobile-app-builder`, `engineering-mobile-release-engineer` |
| Rust | `engineering-rust-refactoring-specialist` |
| CI, build, deploy | `engineering-devops-automator`, `engineering-sre`, `engineering-git-workflow-master` |
| Smallest-diff fixes | `engineering-minimal-change-engineer` |
| Payments, i18n, privacy | `engineering-payments-billing-engineer`, `engineering-i18n-engineer`, `engineering-privacy-engineer` |
| Tests | `testing-test-automation-engineer`, `testing-api-tester`, `testing-accessibility-auditor`, `testing-performance-benchmarker`, `testing-evidence-collector` |
| Review (§6) | `engineering-code-reviewer`, `security-ai-generated-code-auditor`, `security-appsec-engineer`, `security-secrets-credential-engineer`, `design-ui-finish-gate-reviewer` |
| Final "is it really done" gate (§7) | `testing-reality-checker` |
| Docs | `engineering-technical-writer` |
| Something broke in production | `engineering-incident-response-commander` (runbook `incident-response`) |

Replica stages:

| stage | default specialists |
|---|---|
| R1 Recon | `design-ux-researcher`, `product-trend-researcher` |
| R3 Design | `design-ui-designer`, `design-ux-architect` |
| R6 Test | `testing-test-automation-engineer`, `testing-evidence-collector` |
| R8 Entrepreneur | `product-feedback-synthesizer` (same never-fabricate rules: real, linked reviews only) |
| R9 Brand | `design-brand-guardian` |
| R10 Launch | `marketing-content-creator`, `specialized-pricing-analyst`, `marketing-app-store-optimizer` |
| R11 Deploy | `engineering-devops-automator`, `engineering-sre`, `engineering-mobile-release-engineer` |

## Installing them as native agents (optional)

In Claude Code, agent files placed in `~/.claude/agents/` (everyone) or `<project>/.claude/agents/` (one project) become callable subagents by name. Write out only the divisions you use as the original files: `python3 scripts/persona.py --export ~/.claude/agents --division engineering,testing` (byte-for-byte as published; existing files are skipped unless `--force`). Other assistants (Codex, Gemini/Antigravity, Cursor…) need converted formats; the upstream repository's `scripts/install.sh --tool <name>` produces them. Installing changes the user's configuration, so do it when the user or a standing preference asks for it, not on your own initiative.

## Handoffs between specialists

`agents/strategy/coordination/handoff-templates.md` has standard handoff and QA pass/fail templates, and `agent-activation-prompts.md` has example activation prompts. Use them when the project has nothing of its own; when it does (e.g. a `HANDOFF.md` with its own format), the project's format wins.
