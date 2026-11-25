# Competitive & REA Reverse-Engineering Matrix — Findings

**Source methodology**: Public developer documentation, API references, changelogs, architecture guides (via web fetch); REA behavioral inspection (MCP evidence tools); behavioral inference where APIs are private.

---

## Domain A — Voice Assistant (AnF → Kevo)

| Target | Interaction Model | Command Dispatch Flow | Shortcuts | State Persistence | Failure Recovery | Key Delta for Kevo |
|--------|-------------------|------------------------|-----------|-------------------|------------------|---------------------|
| **Siri / App Intents** | Hey Siri → INIntent resolution → app extension handle(intent:completion:) | INIntentHandler resolves → handle → INIntentResponse | App Intents (Swift-native), Shortcuts donations via INInteraction.donate() | Intent donations in system DB; app state in UserDefaults | Exception → "Something went wrong"; retry on next launch | **Compile-time intent schemas; async/await; auto confirmation UI** vs legacy callback-based |
| **Google Assistant** | Hey Google → Built-in Intent (BII) → App Action fulfillment | NLU maps BII → App Action via actions.intent.* deep-link | actions.xml BII mapping; Dynamic Shortcuts via ShortcutManager | BII params via Intent extras; Conversational Actions deprecated (2023) | Unhandled → web search fallback | **No custom session state** — logic client-side only; new model is purely App Actions + BIIs |
| **Alexa** | Hey Alexa → ASR/NLU → SkillRequest → skill endpoint | Skill Kit routes by request.type → intent handler → SkillResponse | Custom Intents (JSON), Built-in Intents, Skill Connections, APL for visuals | Session attributes (in-memory); Persistent via AttributesManager (DynamoDB/S3) | Unhandled → FallbackIntent; Endpoint timeout (8s) → "took too long" | **ASK SDK v2 decorators**; **APL** replaces Display/BodyTemplate |
| **Copilot** | Type/paste → LLM + grounding → streaming | Orchestrator → Model Router → Grounding → Plugins via function-calling → stream | Copilot Studio agents (onMessage/onEvent); Message Extensions; Declarative agents | Conversation in Microsoft 365; plugin state ephemeral | Plugin error → graceful message; Graph throttling → exponential backoff | **Unified Copilot Chat surface** replaces per-app panes; Work IQ semantic indexing; usage-based billing |
| **Mycroft/OVOS** | Hey Mycroft → STT → Intent Parser (Adapt/Padatious/Model2Vec) → MessageBus → Skill | recognizer_loop → intent_service → skill.<name>.intent | Intent files (.intent/.voc); Padatious intents; CQS fallback | MessageBus transient; skill settings in settings.json; HiveMind for multi-device | STT fallback to local; skill crash → auto-restart | **Modular services** (Core/Bus/Plugins); **Persona (LLM chat)**; HiveMind |
| **Raycast** | ⌘Space → type → Extension API → List/Form/HTML | Extension manifest → CLI hot-reload → API (@raycast/api) | Commands (mode: view/no-view; Zod args); Scripts; Quicklinks; Snippets | Preferences via encrypted KV (iCloud Pro); cache TTL | Extension crash → UI toast; network error → toast via showToast | **TS/React extensions in isolated Node**; **AI Presets** versioned; Pro adds cloud sync + GPT-4 |

## Domain B — Audio Studio & Music Hub

| Target | Interaction Model | Dispatch Flow | Shortcuts | State Persistence | Failure Recovery | Key Delta for AnF Audio |
|--------|-------------------|----------------|-----------|-------------------|------------------|--------------------------|
| **Spotify** | App → GET /me/player/play → backend routes to device via SDK/Connect | OAuth2 → Web API endpoints → Web Playback SDK (WebSocket) → Connect | Scopes: user-modify-playback-state; PUT /me/player/play | Tokens (1h) + refresh; server-authoritative playback state | 401 → auto-refresh; 403 → Premium prompt; 429 → backoff | **Web Playback SDK replaces libspotify**; **Connect** device handoff; rate limits per app |
| **Audacity** | External script → named pipe → command execution | mod-script-pipe → command string → reply pipe | Scripting Reference (100+ commands); Macros (linear) | .aup3 SQLite (tracks/clips/labels) | Unknown command → error; BrokenPipe → client error | **mod-script-pipe** = external RPC; **Macros non-Turing** |
| **Pocket Casts** | Tap → play → server push via WebSocket | Reverse-engineered gRPC/REST + WS sync | No public shortcuts | JWT refresh; server-authoritative position | Network loss → local playback continues | **No public API**; podcast-centric sync |

## Domain C — Reading & Narration

| Target | Interaction Model | Dispatch Flow | Shortcuts | State Persistence | Failure Recovery | Key Delta for ThingsBook |
|--------|-------------------|----------------|-----------|-------------------|------------------|--------------------------|
| **ElevenReader** | Upload → TTS pipeline (cloud) → streaming → player | POST /v1/reader/projects → voice → generate → HLS stream | No system shortcuts | Projects in ElevenLabs cloud | Generation fail → Retry; Network → HLS retry | **Cloud-only TTS**; **per-character voices**; **soundscapes**; LLM custom voice design; subscription 200k audiobooks |
| **Readwise Reader** | Save → parse (Readability) → store → highlights → Ghostreader | Ingest via POST /api/v3/save/ → parse → highlights | Web shortcuts: h/n/s/g; iOS Share Sheet; Email forward | PostgreSQL + full-text; sync batch | Parse fail → raw HTML stored; Ghostreader timeout → cached fallback | **Ghostreader LLM first-class**; **bidirectional** highlight sync; paid, no ads |
| **KOReader** | Open → Lua frontend → Document/View → InputDispatcher → TTS | Document:open → format parser → View → Input → TTS | Gestures (settings.gestures); keymap; quickmenu Lua | Per-file SQLite datastorage; settings JSON | Parser crash → nil; OOM → drop rendered pages | **Lua extensibility**; reflow PDF (K2pdfopt); per-file SQLite |
| **Apple Books** | Tap → Books.app → BKLibrary → BKReader → AVSpeech | Library/Reader/Audiobook layers | System Shortcuts via NSUserActivity; Siri INPlayMediaIntent | iCloud sync; Reading Goals via CloudKit | DRM failure → "Unable to play" | **Zero public API**; deep OS integration; Reading Goals; Family Sharing |

---

## Cross-Cutting Patterns

1. **Cloud-first state** vs **local-first**: Spotify, ElevenReader, Readwise, Apple Books = cloud-authoritative; KOReader, Audacity = local-first. AnF already adopts local-first (offline-first mandate).
2. **Shortcut/Intent fragmentation**: Every platform invents its own paradigm — no universal standard. Kevo's typed Rust commands + voice intents are a genuinely differentiated design.
3. **Failure recovery**: Cloud = retry/backoff + toast; local = raw errors/crash recovery. AnF should adopt structured error taxonomy end-to-end.
4. **Observability**: Only Raycast & Copilot expose structured logging. AnF's structured Rust logs (`log.rs`) + tests are stronger.

---

## How to Run Derived Tests

All tests are property-based (given a REA-extracted rule, assert observable behavior). Example skeletons exist for Siri intent donation, Spotify token refresh, ElevenReader generation SLA, KOReader highlight persistence.

**Next**: Pick a target, generate full test suite in native language and wire into CI.

---

## Overnight Notes Additions

- REA connected & doctor healthy; behavioral matrix drafted from public docs + inference + MCP evidence.
- Rate limit hit once for background agent (free model quota); relaunched with reduced scope.
- Save as `docs/REA-COMPETITIVE-MATRIX.md` and keep appending observed differences per feature branch.
