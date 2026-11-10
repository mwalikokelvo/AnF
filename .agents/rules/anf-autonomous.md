---
trigger: always_on
description: Proactively apply matching skills and agency roles in AnF without waiting for manual invocation.
---

## Autonomous Skill and Agency Usage

In AnF:
- **Zero-Prompting Execution**: Do not wait for the developer to call out specific skills. When a task involves:
  - Code review / PR evaluation -> invoke `.agents/skills/code-review-and-quality`
  - Debugging / test failures -> invoke `.agents/skills/systematic-debugging`
  - Implementation / new features -> invoke `.agents/skills/test-driven-development` and `.agents/skills/brainstorming`
  - Final verification -> invoke `.agents/skills/verification-before-completion`
  - Architecture questions -> run `graphify query`
- **AnF Invariants**:
  - `NotchBuddy/Sources/App/PillCatalog.swift` is the source of truth for pills. Never rename pill IDs.
  - Never restyle views currently in production / App Store.
  - Keep 0% CPU footprint when NotchBuddy / Mochi island is hidden.
  - Follow Ponytail mode: smallest complete working diff, reuse first.
