# Phase 3 brief: Memory (facts and history across restarts)

Version 0.4.x. Built and merged on CI gates alone per `docs/KEVO-PLAN.md` (Phases 3, 4 and 5 are merged consecutively, and one PC test after Phase 5 covers all three). Each step is one pull request.

Why: `jarvis-memory.ts` is currently kept in browser `localStorage`, losing structure across resets and storing only raw turns. Kevo cannot explicitly remember personal facts, preferences, or project instructions, cannot recall them across app restarts, and has no list where the user can view or delete what has been remembered.

Phase 3 is done when:
- Facts explicitly told to Kevo survive an app restart and are recalled accurately when relevant.
- Recent conversation requests and turns survive an app restart.
- Spoken "forget that..." or clicking delete on a remembered fact permanently removes it so Kevo never brings it up again.
- Memory respects size and count bounds, and corrupt records are healed without crashing.

## 3.1 Persistent memory store

Add `windows/src-tauri/src/kevo_memory.rs` providing structured, persistent storage in the local data directory (`~/AppData/Roaming/Coucou/kevo_memory.json` or SQLite table). It keeps two stores:
- `facts`: `{ id: string, fact: string, category: string, created_at: number, updated_at: number }`
- `turns`: `{ id: string, role: "user" | "assistant", text: string, at: number }` bounded to the latest 50 turns.

Tauri commands:
- `kevo_memory_remember_fact(fact: String, category: Option<String>) -> Result<KevoFact, String>`
- `kevo_memory_list_facts(query: Option<String>) -> Result<Vec<KevoFact>, String>`
- `kevo_memory_delete_fact(id: String) -> Result<bool, String>`
- `kevo_memory_clear_facts() -> Result<bool, String>`
- `kevo_memory_load_history(limit: Option<usize>) -> Result<Vec<JarvisTurn>, String>`
- `kevo_memory_save_turn(role: String, text: String) -> Result<(), String>`

Expose on `Bridge` (`windows/src/core/bridge.ts`) and wire into `jarvis-memory.ts` so `appendJarvisTurn`, `getJarvisHistory`, and facts persist through native storage.

## 3.2 Remember action and tool calling

Add `remember_fact` to `windows/src/workspace/jarvis/voice/kevo-actions.ts`:
- Name: `remember_fact`
- Description: "Remember a personal fact, preference, rule, or instruction about the user or environment."
- Parameters: `{ fact: string, category?: string }`
- Result: saves the fact via `Bridge.kevoMemoryRememberFact`, speaks a concise confirmation ("I will remember that: ...").

Handle both model tool calling ("Remember that I prefer TypeScript over JavaScript", "Keep in mind that my desk is near the window") and fast-path commands ("remember: ...", "remember that ...").

## 3.3 Context injection and recall

Add `recall_facts` to `kevo-actions.ts` allowing the model to search memory for specific topics.

Update `getKevoSystemPrompt()` and dynamic system prompt in `kevo_ask`:
- Automatically format and inject the user's active remembered facts into the system prompt under a `# Remembered Facts` section (bounded to the 15 most recent/relevant facts, under 500 tokens).
- Fast path instant answer for "What do you remember about me?", "What do you know about me?", and "List your memories".

## 3.4 Forget action and list with delete

Add `forget_fact` to `kevo-actions.ts`:
- Parameters: `{ query?: string, id?: string }`
- Spoken commands: "Forget that I like jazz", "Forget my preference about dark chocolate", "Forget what I said about X".
- Locates matching facts, removes them, and confirms ("I have forgotten that.").

In Kevo Settings / Command Desk:
- Add a "Memory" tab/card showing all remembered facts with timestamps, a one-click Delete button for each, and a "Clear all memories" button.

## 3.5 Restart survival and test suite

Unit tests in Rust (`kevo_memory.rs`) and TypeScript (`kevo-memory.test.ts`):
- Saving facts and turns persists across fresh agent / store instantiation.
- Deleted facts are permanently erased and do not appear in searches or system prompts.
- Corrupted memory files fall back gracefully to empty state without crashing.
- Phrase list tests in `windows/tests/kevo-phrases.json` pass 100% for remember/recall/forget requests.
