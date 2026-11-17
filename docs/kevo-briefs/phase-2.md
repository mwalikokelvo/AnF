# Phase 2 brief: Understanding (tool calling)

Version 0.3.x. Starts only after Phase 1 has passed on the owner's PC. Each step is one pull request. Claude design review (a fresh subagent) is required on every pull request in this phase.

Why: `jarvis-voice-agent.ts` decides with hand-written patterns, so every new phrasing needs new code. The local model is never told what Kevo can do, so it answers "I don't know" about itself or repeats itself.

Phase 2 is done when the phrase list (Phase 0 step 0.2) passes at 95% or more in CI with the shipped model, and the PC self-test passes the Phase 0 checks plus 20 new varied requests at 18 of 20 or better, with commands answered within 1.5 s.

## 2.1 One action list

`windows/src/workspace/jarvis/voice/kevo-actions.ts` defines every action once: name, one-line description, JSON-schema parameters, and the function that carries it out. It covers the actions in `JarvisActionContext`: open app, open site, YouTube search, web search, music play, pause and next, set or cancel a timer, take a note, search notes, change voice, list voices, switch AnF view, briefing, help. The instant commands and the tool list are both built from it.

## 2.2 Tool calling

Start `llama-server` with `--jinja` (`windows/src-tauri/src/local_ai.rs`). `kevo_ask` sends the action list as OpenAI-style `tools` (https://mintlify.com/ggml-org/llama.cpp/advanced/function-calling). A reply is either text (spoken) or one or more tool calls, run in order. A chained request ("open Brave and search YouTube for lofi") becomes several calls.

Check that the Qwen3 chat template in the shipped GGUF produces proper tool calls, with no raw `<tool_call>` text leaking into replies. If it does not, ship a template file and pass `--chat-template-file`.

## 2.3 What Kevo knows about itself

The system prompt gains a short capability sheet generated from the action list (what Kevo can and cannot do, how the wake word and follow-up window work, how to change the voice). The quick answers for help, the name and the microphone stay as instant commands.

## 2.4 Instant commands stay instant

Before the model is asked, a fast path handles: stop, repeat, time, date, timers, sums, "open <exact installed app or AnF place>", and the help, name and microphone answers. It works with no model loaded. Everything else goes to the model.

## 2.5 No cold start

Start loading the model when the microphone is turned on (and when AnF starts with the microphone on), not at the first question. The self-test measures the first model-routed command after a fresh start separately: it must start its reply within 5 s. Later model-routed commands must start within 1.5 s.

## 2.6 Model choice and the CI gate

A CI job (Linux) starts `llama-server` with the model Windows ships (the Q8_0 GGUF pinned in `model_download/policy.rs`, not the Q4_K_M that `prepare-linux.mjs` requantizes for Linux) and runs the whole phrase list through the real `kevo_ask` path. It fails below 95%.

Model size: read RAM and graphics card from the newest `selftest-*.json` on the state branch. Default is Qwen3 1.7B. Use the next size up only if the PC has 16 GB RAM or more and the self-test shows the first spoken sentence within 5 s with it.

## 2.7 Remove what the model now covers

Delete the regex branches in `jarvis-voice-agent.ts` that the action list and the model now handle. Keep every existing test passing; move phrase-level tests into the phrase list. Remove the browser hearing option (Phase 1 step 1.3).
