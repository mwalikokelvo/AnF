---
name: voice-assistant-rename
description: Customize an AI voice assistant's identity (wake word, name, capabilities) in a TypeScript/React project. Covers wake word detection, UI label updates, test updates, and build verification.
category: software-development
version: 1.0.0
author: mwalikokelvo
license: MIT
metadata:
  hermes:
    tags: [voice-assistant, wake-word, rename, customization, automation, workflow]
    related_skills: [agentskills-update]
---

# Voice Assistant Rename

## When to use
- Renaming a voice assistant's identity (name, wake word, capabilities) in a TypeScript/React project
- Migrating a voice agent from one brand name to another
- Updating wake word detection logic in the speech listener
- Updating UI labels, capability tables, and documentation
- Updating test suites to match new naming conventions

## Standing user preferences
- **Wake word detection**: Use case-insensitive regex anchored at the start of utterance: `^(kevo|kev-o|keyvo|kebo|kavo)[,\s]*`
- **AI fallback gate**: Require at least 2 words after the wake word before falling back to `askAI`, so casual nickname mentions do not trigger false AI calls
- **Code naming**: Source directory stays `jarvis/` but all exported classes and exports use `Kevo*` prefix (e.g., `KevoVoiceAgent`, `KevoVoiceListener`)
- **Test naming**: Test files use the same prefixes as source (e.g., `KevoVoiceAgent`, `KevoVoiceListener`)
- **No backwards-compatibility aliases**: Delete all legacy wake-word regexes and old capability strings

## Procedure
1. **Inventory**: Grep the repo for all references to the old name (e.g., `Jarvis`, `Mine`, `Forever`) across source, UI, tests, and documentation.
2. **Source updates**: Update the core voice agent files:
   - `voice/jarvis-voice-listener.ts` → change class name, default wake words, and comments
   - `voice/jarvis-voice-agent.ts` → change class name, action names, prompts, speech replies
   - `voice/jarvis-memory.ts` → update storage key and exports
   - `voice/jarvis-voice-pack.ts` → update voice pack registry and exports
   - `voice/jarvis-speaker.ts` → rename class
3. **UI updates**: Update the command desk, HUD, executive, and any other UI components:
   - `jarvis-command-desk.ts` → rename to `createKevoCommandDesk`, update wake words, labels, and status text
   - `jarvis-hud.ts` → rename to `KevoHud`, update CSS class names
   - `jarvis-executive.ts` → rename to `KevoExecutive`, update greeting and capability names
   - `jarvis-voice-listener.ts` → update wake word list
4. **Agent connector updates**: Update agent files that contain `JARVIS` references in comments or capability strings.
5. **Test updates**: Update all test files to use the new class names and wake words:
   - `tests/jarvis-*.test.ts` → update imports, class names, wake word assertions
   - `tests/.jarvis-*.test.mjs` → update imports and class names
6. **Verify**: Run `npm test` and `npm run build` to confirm all tests pass and the build succeeds.

## Wake word detection
The speech listener uses case-insensitive regex anchored at the start of the utterance:
```
^(kevo|kev-o|keyvo|kebo|kavo)[,\s]*
```
This accepts "Kevo", "kev-o", "keyvo", "kebo", and "kavo" as valid wake words, followed by optional comma or whitespace. The listener strips the matched wake word and forwards the cleaned transcript to the agent.

## AI fallback gate
Before falling back to `askAI`, the agent checks that the cleaned transcript contains at least 2 words. This prevents casual mentions of the nickname (e.g., "Kevo..." with only 1 word after) from triggering an AI call.

## Pitfalls
- **Do not treat code directories as skills.** A directory without `SKILL.md` at its root is not a skill — it may be the repo's app code, config, or libraries.
- **Do not mix stale and fresh copies.** Always remove the target skill directory before installing a new version.
- **Do not patch an existing skill without reading it first.** Reading ensures you do not overwrite richer content in the real skill.
- **Do not duplicate lessons already stated.** Search the skill's `references/` and `SKILL.md` before adding a new rule.
- **Do not create per-session or per-incident files.** Name references by topic, not by date or incident.
- **Do not record environment failures as rules.** PATH, toolchain, and permission issues are not durable class-level rules.
- **Do not drop negative claims about tools.** If a tool actually failed but the real fix is environment state, capture the FIX under an existing troubleshooting skill, not as a standalone constraint.

## Test and build workflow (Windows)
- Node.js `node --test` on `.ts` test files requires `.ts` extensions in all imports (e.g., `from './jarvis-memory.ts'`), because ESM cannot resolve bare relative paths to `.ts` files. Use `node scripts/test.mjs` (the esbuild bundler) to run tests, which resolves `.ts` automatically.
- When tests fix `.ts` imports in source files, add `allowImportingTsExtensions: true` and `noResolve: false` to `tsconfig.json` compilerOptions, or `tsc --noEmit` fails with TS5097.
- `vite build` in foreground mode can appear to hang (long-lived server). Use `npm run build` (which chains `tsc && vite build`) or run in background.

## Pitfalls
- **Do not treat code directories as skills.** A directory without `SKILL.md` at its root is not a skill — it may be the repo's app code, config, or libraries.
- **Do not mix stale and fresh copies.** Always remove the target skill directory before installing a new version.
- **Do not patch an existing skill without reading it first.** Reading ensures you do not overwrite richer content in the real skill.
- **Do not duplicate lessons already stated.** Search the skill's `references/` and `SKILL.md` before adding a new rule.
- **Do not create per-session or per-incident files.** Name references by topic, not by date or incident.
- **Do not record environment failures as rules.** PATH, toolchain, and permission issues are not durable class-level rules.
- **Do not drop negative claims about tools.** If a tool actually failed but the real fix is environment state, capture the FIX under an existing troubleshooting skill, not as a standalone constraint.
