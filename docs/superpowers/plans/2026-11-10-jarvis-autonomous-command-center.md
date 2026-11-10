# JARVIS Autonomous Multi-Agent Command Center & Capability Expansion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform AnF from a workspace app into a unified, autonomous JARVIS multi-agent command center with a futuristic real-time monitoring HUD, specialized agent personas (Executive JARVIS, Developer Tom, Growth Scout, Support Operations), clean MCP connector pipes, and expanded offline-first media/knowledge tools.

**Architecture:** Build a modular `jarvis/` orchestration subsystem within the Tauri/TypeScript desktop environment. The core is an event-driven `JarvisExecutive` hub that polls local system diagnostics, coordinates specialized subagents via structured JSON RPC/events, visualizes real-time status on a high-tech SVG/Canvas orbital HUD, and communicates through dedicated, verifiable MCP connector adapters.

**Tech Stack:** TypeScript (ES2022), HTML5 Canvas/SVG, Tauri IPC (Rust backend commands for OS stats & native processes), Web Audio DSP API, OpenZIM protocol, LRCLIB / Audius / Archive.org streaming, Node.js test runner (`node --test`).

**Spec:** Inspired by Cindy Zhu's autonomous multi-agent JARVIS architecture (`cindiezhu_20261109_152622001.mp4`), synthesizing Anthropic Claude Code agentic patterns, Model Context Protocol (MCP) modular connectors, and local-first privacy.

---

## Global Constraints

- **Offline-First & Zero Telemetry**: Every core capability must execute completely without network access. Online lookups or external API calls are strictly opt-in and gated by `onlineLookupsEnabled()`.
- **Performance & Smallest Working Diff**: Keep rendering smooth (60fps Canvas HUD without CPU bloat). Avoid heavy external dependencies; use native Web APIs and standard TypeScript interfaces.
- **Contract & Test Suite Integrity**: All 513 existing unit tests must remain passing. Every new module must include dedicated automated unit tests under `windows/tests/`.
- **Platform Compatibility**: Code must compile cleanly across Windows (Tauri x64/NSIS) and Android (WebView).

---

## Review Focus

1. **System Resource Safety**: The real-time HUD and background monitoring must throttle when the window is hidden or unfocused (`requestAnimationFrame` pausing and 2000ms idle timer).
2. **Graceful Connector Fallback**: When an MCP connector (e.g. RevenueCat or Meta Ads) has no API key or network is disconnected, the system must show honest offline mock/cached values without crashing.
3. **Audio & Media State Isolation**: The JARVIS audio briefing and voice synthesizer must never clobber active music playback in `music-hub.ts`; it must duck volume or yield cleanly.
4. **Data Persistence**: Agent tasks, daily statistics, and user preferences must persist in local storage/IndexedDB with transaction safety.
5. **Screen Reader Accessibility**: The futuristic visual HUD tiles must have semantic ARIA labels, roles, and keyboard navigation.

---

## Subsystem Architecture Map

```
windows/src/workspace/
├── jarvis/
│   ├── jarvis-hud.ts            # Futuristic orbital canvas & telemetry matrix HUD
│   ├── jarvis-hud.css           # Sci-fi HUD aesthetic, neon accents, glowing rings
│   ├── jarvis-executive.ts      # Executive Orchestrator (morning briefing, system status)
│   ├── agents/
│   │   ├── tom-developer.ts     # Developer agent (test suite runner, git status, build manager)
│   │   ├── scout-growth.ts      # Content & growth agent (Supoclip 9:16 clips, Substack draft, SEO)
│   │   └── support-agent.ts     # Support operations (Chatwoot inbox triage & auto-resolution)
│   ├── connectors/
│   │   ├── mcp-connector-base.ts# Base interface for clean, verifiable tool pipes
│   │   ├── revenue-connector.ts # Revenue & subscription tracking (RevenueCat / Stripe metrics)
│   │   ├── ads-connector.ts     # Ad spend & ROAS analytics (Meta / Google ads connector)
│   │   └── system-connector.ts  # Hardware load, battery, memory, network stats via Tauri IPC
│   └── jarvis-command-desk.ts   # Unified command center view mounting the HUD and agent tiles
```

---

## Tasks

### Task 1: System Telemetry & Hardware Load Connector

**Files:**
- Create: `windows/src/workspace/jarvis/connectors/system-connector.ts`
- Test: `windows/tests/jarvis-system-connector.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SystemTelemetry {
    cpuLoadPct: number;
    memoryUsedMb: number;
    memoryTotalMb: number;
    networkRxKbps: number;
    networkTxKbps: number;
    batteryPct?: number;
    isCharging?: boolean;
    audioEngineStatus: 'idle' | 'playing' | 'processing';
    activeProcesses: number;
  }
  export function fetchSystemTelemetry(): Promise<SystemTelemetry>;
  ```

- [ ] **Step 1: Write the failing test**
  In `windows/tests/jarvis-system-connector.test.ts`, test `fetchSystemTelemetry()` returns sane defaults in node/test environments, clamps percentages between 0 and 100, and reports audio engine status accurately.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test windows/tests/jarvis-system-connector.test.ts`
  Expected: FAIL with module not found.

- [ ] **Step 3: Implement `system-connector.ts`**
  Implement `fetchSystemTelemetry()` with fallback browser performance APIs (`navigator.hardwareConcurrency`, `performance.memory`, `navigator.getBattery`) and mockable IPC bridge for test environments.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test windows/tests/jarvis-system-connector.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add windows/src/workspace/jarvis/connectors/system-connector.ts windows/tests/jarvis-system-connector.test.ts
  git commit -m "feat(jarvis): system telemetry and hardware connector"
  ```

---

### Task 2: Revenue & Growth Analytics Connector (RevenueCat / Stripe)

**Files:**
- Create: `windows/src/workspace/jarvis/connectors/revenue-connector.ts`
- Test: `windows/tests/jarvis-revenue-connector.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RevenueStats {
    mrr: number;
    arrTrajectory: number;
    activeSubscribers: number;
    newCustomers7d: number;
    currency: string;
    lastUpdated: number;
    isDemo: boolean;
  }
  export class RevenueConnector {
    constructor(apiKey?: string);
    getStats(): Promise<RevenueStats>;
    setDemoMode(enabled: boolean): void;
  }
  ```

- [ ] **Step 1: Write the failing test**
  In `windows/tests/jarvis-revenue-connector.test.ts`, verify that `RevenueConnector` defaults to honest offline demo metrics (e.g. Cindy Zhu's \$30k MRR benchmark: 2,459 active subscribers, \$30k MRR) when unconfigured, parses live JSON responses cleanly when configured, and never leaks API secrets in errors.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test windows/tests/jarvis-revenue-connector.test.ts`
  Expected: FAIL with module not found.

- [ ] **Step 3: Implement `revenue-connector.ts`**
  Implement `RevenueConnector` supporting local cached storage, demo state, and safe HTTPS queries via `safeHttpsUrl`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test windows/tests/jarvis-revenue-connector.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add windows/src/workspace/jarvis/connectors/revenue-connector.ts windows/tests/jarvis-revenue-connector.test.ts
  git commit -m "feat(jarvis): revenue and subscription analytics connector"
  ```

---

### Task 3: Marketing & Ad Spend Connector (Meta & Growth Metrics)

**Files:**
- Create: `windows/src/workspace/jarvis/connectors/ads-connector.ts`
- Test: `windows/tests/jarvis-ads-connector.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AdCampaignStats {
    totalSpendUsd: number;
    roas: number;
    impressions: number;
    clicks: number;
    cpc: number;
    organicVideosPosted7d: number;
    topCampaignName: string;
    isDemo: boolean;
  }
  export class AdsConnector {
    getStats(): Promise<AdCampaignStats>;
  }
  ```

- [ ] **Step 1: Write the failing test**
  In `windows/tests/jarvis-ads-connector.test.ts`, test that `AdsConnector` reports ROAS, spend (\$475 at 1.5x ROAS in demo mode matching Cindy Zhu's presentation), computes effective CPC, and safely validates inputs.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test windows/tests/jarvis-ads-connector.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement `ads-connector.ts`**
  Implement `AdsConnector` with local offline defaults, ROAS math, and integration points for marketing campaigns.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test windows/tests/jarvis-ads-connector.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add windows/src/workspace/jarvis/connectors/ads-connector.ts windows/tests/jarvis-ads-connector.test.ts
  git commit -m "feat(jarvis): ads analytics and marketing connector"
  ```

---

### Task 4: Specialized Subagents (Tom Developer, Scout Growth, Support Operations)

**Files:**
- Create: `windows/src/workspace/jarvis/agents/tom-developer.ts`
- Create: `windows/src/workspace/jarvis/agents/scout-growth.ts`
- Create: `windows/src/workspace/jarvis/agents/support-agent.ts`
- Test: `windows/tests/jarvis-agents.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AgentTaskReport {
    agentName: 'Tom (Developer)' | 'Scout (Growth)' | 'Support (Ops)';
    status: 'idle' | 'busy' | 'completed' | 'alert';
    summary: string;
    itemsProcessed: number;
    actionLabel?: string;
    onAction?: () => void;
  }
  export function runTomDevInspection(): Promise<AgentTaskReport>;
  export function runScoutContentScan(): Promise<AgentTaskReport>;
  export function runSupportTriage(): Promise<AgentTaskReport>;
  ```

- [ ] **Step 1: Write the failing test**
  In `windows/tests/jarvis-agents.test.ts`, test:
  1. `runTomDevInspection()` reports test suite status (e.g., "All 513 unit tests passing; zero TypeScript errors").
  2. `runScoutContentScan()` integrates with `video-clipper.ts` and `article-publishing.ts` to surface ready-to-publish short-form clips and Substack drafts.
  3. `runSupportTriage()` checks `chatwoot-inbox.ts` to count auto-resolved inquiries and escalate pending issues.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test windows/tests/jarvis-agents.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement `tom-developer.ts`, `scout-growth.ts`, and `support-agent.ts`**
  Wire real inspections to existing AnF subsystems:
  - Tom connects to unit tests, git status, and build checks.
  - Scout connects to audio trimmer, Supoclip video clipper, and SEO audit.
  - Support agent connects to `ChatwootInboxManager`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test windows/tests/jarvis-agents.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add windows/src/workspace/jarvis/agents/ windows/tests/jarvis-agents.test.ts
  git commit -m "feat(jarvis): specialized autonomous subagent personas"
  ```

---

### Task 5: Futuristic JARVIS Orbital HUD & Telemetry Canvas

**Files:**
- Create: `windows/src/workspace/jarvis/jarvis-hud.ts`
- Create: `windows/src/workspace/jarvis/jarvis-hud.css`
- Test: `windows/tests/jarvis-hud.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface JarvisHudOptions {
    onSphereClick?: () => void;
    interactive?: boolean;
  }
  export function createJarvisHud(options?: JarvisHudOptions): {
    root: HTMLElement;
    updateTelemetry: (stats: SystemTelemetry) => void;
    pulseMessage: (msg: string) => void;
    destroy: () => void;
  };
  ```

- [ ] **Step 1: Write the failing test**
  In `windows/tests/jarvis-hud.test.ts`, test DOM creation of the HUD canvas, presence of ARIA telemetry landmarks, update callbacks, and proper cleanup of animation frame loops on `destroy()`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test windows/tests/jarvis-hud.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement `jarvis-hud.ts` and `jarvis-hud.css`**
  Implement:
  - Central holographic rotating sphere with glowing rings, coordinate markers, and pulse wave.
  - Real-time HUD tiles matching the video design:
    1. `SYS_STATUS // CORE_MATRIX`: Visual block status grid.
    2. `AI_CORE // NEURAL_LINK`: Central orbital ring & latency pulse.
    3. `ENV_DYNAMICS // AUX_LOAD`: CPU, Memory, and Hardware Load dials.
    4. `NET_FLOW // PROTOCOL_STATS`: Throughput graphs and active ports.
    5. `FREQ_ANALYSIS // HARDWARE_LOAD`: Frequency spectrum visualizer connected to Web Audio or synthetic idle pulse.
    6. `TERM_CON // DB_QUERY`: Real-time query and task log console.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test windows/tests/jarvis-hud.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add windows/src/workspace/jarvis/jarvis-hud.ts windows/src/workspace/jarvis/jarvis-hud.css windows/tests/jarvis-hud.test.ts
  git commit -m "feat(jarvis): futuristic orbital telemetry canvas and sci-fi HUD"
  ```

---

### Task 6: Executive Orchestrator & Briefing Engine

**Files:**
- Create: `windows/src/workspace/jarvis/jarvis-executive.ts`
- Test: `windows/tests/jarvis-executive.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ExecutiveBriefing {
    greeting: string;
    greetingTime: 'morning' | 'afternoon' | 'evening';
    headline: string;
    highlights: string[];
    pendingDecisions: string[];
    suggestedFirstAction: { label: string; action: () => void };
  }
  export class JarvisExecutive {
    generateBriefing(): Promise<ExecutiveBriefing>;
    executeVoiceBriefing(): Promise<void>;
  }
  ```

- [ ] **Step 1: Write the failing test**
  In `windows/tests/jarvis-executive.test.ts`, test that `JarvisExecutive` aggregates telemetry, revenue stats, agent reports, and support inbox status into a coherent executive briefing ("Welcome back, sir...").

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test windows/tests/jarvis-executive.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement `jarvis-executive.ts`**
  Implement aggregation and text synthesis logic, connecting to `neural-speech.ts` / `tts-service.ts` for optional spoken audio briefing with speech ducking.

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test windows/tests/jarvis-executive.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add windows/src/workspace/jarvis/jarvis-executive.ts windows/tests/jarvis-executive.test.ts
  git commit -m "feat(jarvis): executive orchestrator and daily briefing engine"
  ```

---

### Task 7: Command Center View & Main Workspace Integration

**Files:**
- Create: `windows/src/workspace/jarvis/jarvis-command-desk.ts`
- Modify: `windows/src/workspace/main.ts`
- Modify: `windows/src/workspace/anf-brand.ts`
- Test: `windows/tests/jarvis-integration.test.ts`

**Interfaces:**
- Consumes: `createJarvisHud`, `JarvisExecutive`, `RevenueConnector`, `AdsConnector`, Agent task runners.
- Produces: Mounts `JARVIS Command Center` tab or dedicated executive view mode in `main.ts`.

- [ ] **Step 1: Write integration test**
  In `windows/tests/jarvis-integration.test.ts`, verify that `createJarvisCommandDesk` instantiates cleanly, binds all MCP connectors, dispatches view switching, and doesn't leak timers on unload.

- [ ] **Step 2: Implement `jarvis-command-desk.ts`**
  Assemble the complete UI:
  - Top: Header with system uptime, JARVIS status badge ("ONLINE // DATA LINK SECURE"), and "Morning Briefing" play button.
  - Middle: Futuristic orbital HUD canvas (`jarvis-hud.ts`).
  - Bottom: 4 interactive agent cards (Tom Developer, Scout Growth, Support Ops, Revenue & Ads).
  - Quick launch pills to embedded native tools (Audio Studio, Clipper, ZIM reader, Substack).

- [ ] **Step 3: Mount in `main.ts` and sidebar**
  Add icon & navigation entry in `anf-brand.ts` and `main.ts` (`section('jarvis', 'JARVIS Command', jarvisDesk.root)`).

- [ ] **Step 4: Full verification and compilation**
  Run: `npx tsc --noEmit` and `npm test` across all suites.
  Expected: PASS with 0 errors and all tests green.

- [ ] **Step 5: Commit & Pack**
  ```bash
  git add windows/src/workspace/jarvis/ windows/src/workspace/main.ts windows/src/workspace/anf-brand.ts windows/tests/jarvis-integration.test.ts
  git commit -m "feat(jarvis): complete JARVIS autonomous command center desktop integration"
  ```
