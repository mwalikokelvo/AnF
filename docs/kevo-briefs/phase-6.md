# Phase 6 brief: Better answers (largest local model the PC runs within 5 s)

Version 0.5.x. Each step is one pull request.

Why: An assistant that answers simple questions quickly but struggles on reasoning, complex explanations, or nuanced context feels toy-like. Today, Kevo defaults to a single fixed model (`model-source.gguf`, Qwen3 1.7B Q8_0). On modern PCs with 16 GB or 32 GB RAM (or dedicated GPU/VRAM), larger, more capable models (e.g. Qwen 2.5 3B/7B, DeepSeek models) provide vastly deeper comprehension, structured thinking, and richer conversation. Conversely, on lower-spec machines, running an oversized model causes multi-second cold stalls and breaches the 5-second voice response deadline. Furthermore, when tool calling is enabled, responses previously disabled streaming, delaying the first spoken sentence until the entire generation finished.

Phase 6 is done when:
- The largest local model supported by the host PC's verified hardware profile (RAM, CPU cores, AVX2/GPU acceleration) is selected and loaded automatically.
- The first spoken and displayed sentence arrives within 5.0 seconds from the end of the user's speech on conversational queries.
- Tool calling supports streaming chunks and sentence-level emission so that explanations and status replies begin speaking with zero cold delay.
- System prompt and context prefill are optimized to keep prefill latency strictly under 1.5 s.
- Real-time time-to-first-sentence (TTFS) telemetry is captured in Kevo's log and displayed on the Command Desk HUD.
- Harder conversational and reasoning questions pass automated evaluation with high answer quality and zero cloud leaks.

---

## 6.1 Hardware-Aware Model Selection & Profile Tiers

In `windows/src/workspace/local-ai-manager.ts`, `windows/src-tauri/src/kevo_system.rs`, and `windows/src-tauri/src/local_ai.rs`:
- Implement hardware inspection evaluating available RAM, CPU thread count, and acceleration:
  - **Tier 1 (Fast / Low-RAM < 8 GB)**: Qwen 0.6B / 1.7B Q4/Q8 (target TTFS < 2.0 s).
  - **Tier 2 (Balanced / 8–16 GB RAM)**: Qwen 1.7B Q8_0 / Qwen 2.5 3B Q4_K_M (target TTFS < 3.5 s).
  - **Tier 3 (Quality / >= 16 GB RAM + AVX2/GPU)**: Largest verified profile (Qwen 2.5 7B Q4_K_M or DeepSeek Flash/Reasoning) meeting the <= 5.0 s constraint.
- Compute dynamic thread allocation (`num_threads = min(physical_cores, 8)`) and context bounds.
- Allow user override in Kevo settings with clear speed/quality tradeoffs.

## 6.2 Streaming Tool Calling & Low-Latency Sentence Chunking

In `windows/src-tauri/src/local_ai.rs` and `windows/src/workspace/jarvis/voice/jarvis-voice-agent.ts`:
- Enable streaming on local AI inference even when `tools` are present:
  - Parse SSE chunks as they arrive from `llama-server`.
  - Buffer potential `<tool_call>` tags while immediately streaming normal conversational sentences to the speaker via `onPart`.
  - If a tool call is identified, dispatch execution immediately upon tag closure and stream the action's spoken reply.
- Eliminate tool-choice head-of-line blocking so voice synthesis begins on the first sentence within 5 s.

## 6.3 Context Prefill Optimization & Prompt Compaction

In `windows/src/workspace/jarvis/voice/kevo-actions.ts` and `windows/src-tauri/src/workspace_commands.rs`:
- Optimize `getKevoSystemPrompt`:
  - Prune redundant capability descriptions while retaining strict tool schemas and essential self-knowledge.
  - Structure prompt prefix so `llama-server` can leverage prompt caching across consecutive conversation turns.
  - Bound conversation history to the most relevant recent turns (pruning stale context) to keep TTFS under 5 s even in long sessions.

## 6.4 Time-To-First-Sentence (TTFS) Telemetry & HUD Badge

In `windows/src-tauri/src/kevo_hud.rs`, `windows/src/workspace/jarvis/jarvis-command-desk.ts`, and `windows/src/workspace/jarvis/voice/jarvis-voice-agent.ts`:
- Accurately measure TTFS: interval from speech recognition completion (`onFinalSpeech`) to the first synthesized audio chunk or first sentence delivered.
- Log TTFS in Kevo's local JSON log (`kevo_log_append` with `{ type: 'ttfs', ms: elapsed, model: activeModel }`).
- Surface live badge on Command Desk and Float HUD: "First sentence: 1.8 s (Model: Qwen 1.7B Q8)".

## 6.5 Performance Benchmarking & Reasoning Evaluation Suite

In `windows/tests/kevo-performance.test.ts` and `windows/scripts/kevo-ci-gate.mjs`:
- Automated test suite benchmarking:
  - Factual and common questions (clock, weather, general knowledge).
  - Multi-step reasoning queries.
  - Complex instructions with memory and tools.
- Asserts that 100% of benchmark queries produce their first sentence within 5.0 seconds.
- Verifies that answer quality, grammar, and grounding adhere to Kevo's offline companion standards.
