// Thin wrapper over the Tauri commands/events. Every call is a no-op when the
// page is opened in a plain browser, so the island can be iterated on with
// `npm run dev` alone.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Settings } from "./state";

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!IS_TAURI) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`[coucou] ${cmd} failed`, err);
    return null;
  }
}

export interface BootInfo {
  settings: Settings;
  /** Logical screen rect of the monitor the island lives on. */
  screen: { x: number; y: number; width: number; height: number; scale: number };
  version: string;
  hookPath: string;
  /** False where the OS has no global cursor (Wayland): see Island.followPageCursor. */
  cursorPoll: boolean;
}

export interface KevoHardwareProfile {
  totalRamGb: number;
  availableRamGb: number;
  cpuCores: number;
  arch: string;
  recommendedTier: 'fast' | 'balanced' | 'quality';
  recommendedThreads: number;
  avx2Supported: boolean;
}

export const Bridge = {
  boot: () => call<BootInfo>("boot"),

  saveSettings: (settings: Settings) => call<void>("save_settings", { settings }),

  /** Shrink the window down to the invisible wake strip (hidden) or back to full. */
  setCollapsed: (collapsed: boolean) => call<void>("set_collapsed", { collapsed }),

  /**
   * Pushes the island shape in window coordinates. Rust flips click-through from
   * its own cursor poll, so the flag is never a frame behind a click.
   */
  setIslandRect: (x: number, y: number, width: number, height: number) =>
    call<void>("set_island_rect", { x, y, width, height }),

  /** Give the window keyboard focus (chat field) and take it away again. */
  focusWindow: (focused: boolean) => call<void>("focus_window", { focused }),

  reposition: () => call<void>("reposition"),

  openUrl: (url: string) => call<void>("open_url", { url }),

  /** "Open terminal" → opens the folder in VS Code when `code` is on PATH. */
  openInVSCode: (path: string | null) => call<boolean>("open_in_vscode", { path }),

  quit: () => call<void>("quit_app"),
  quitApp: () => call<void>("quit_app"),

  isKevoSelftest: () => call<boolean>("is_kevo_selftest"),
  kevoSelftestGetClips: () => call<string>("kevo_selftest_get_clips"),
  kevoSelftestReadClip: (file: string) => call<number[]>("kevo_selftest_read_clip", { file }),
  kevoSelftestSaveResult: (resultJson: string) => call<string>("kevo_selftest_save_result", { resultJson }),
  kevoGraphicsCard: () => call<string>("kevo_graphics_card"),
  kevoMeasureIdleCpu: (seconds?: number) => call<number>("kevo_measure_idle_cpu", { seconds }),
  systemStats: () => call<Record<string, unknown>>("system_stats"),
  kevoHudSet: (state: string, line?: string, level?: number) => call<void>("kevo_hud_set", { state, line, level }),
  kevoHudAnswer: (id: number | string, approved: boolean) => call<void>("kevo_hud_answer", { id, approved }),
  kevoAsk: (id: number, query: string, history: unknown[], model: string, tools?: unknown[], system?: string) =>
    call<unknown>("kevo_ask", { id, query, history, model, tools, system }),
  kevoCancel: () => call<void>("kevo_cancel"),
  kevoPreloadModel: (model?: string) => call<void>("kevo_preload_model", { model }),
  kevoMemoryRememberFact: (fact: string, category?: string) =>
    call<{ id: string; fact: string; category: string; created_at: number; updated_at: number }>("kevo_memory_remember_fact", { fact, category }),
  kevoMemoryListFacts: (query?: string) =>
    call<Array<{ id: string; fact: string; category: string; created_at: number; updated_at: number }>>("kevo_memory_list_facts", { query }),
  kevoMemoryDeleteFact: (id: string) =>
    call<boolean>("kevo_memory_delete_fact", { id }),
  kevoMemoryClearFacts: () =>
    call<boolean>("kevo_memory_clear_facts"),
  kevoMemoryLoadHistory: (limit?: number) =>
    call<Array<{ id: string; role: 'user' | 'assistant'; text: string; at: number }>>("kevo_memory_load_history", { limit }),
  kevoMemorySaveTurn: (role: string, text: string) =>
    call<void>("kevo_memory_save_turn", { role, text }),
  kevoMemoryClearHistory: () =>
    call<boolean>("kevo_memory_clear_history"),

  kevoScheduleCreateReminder: (message: string, trigger_at: number, recurring?: string) =>
    call<{ id: string; message: string; trigger_at: number; created_at: number; fired: boolean; recurring?: string }>(
      "kevo_schedule_create_reminder",
      { message, trigger_at, recurring }
    ),
  kevoScheduleListReminders: (include_fired?: boolean) =>
    call<Array<{ id: string; message: string; trigger_at: number; created_at: number; fired: boolean; recurring?: string }>>(
      "kevo_schedule_list_reminders",
      { include_fired }
    ),
  kevoScheduleCancelReminder: (id: string) =>
    call<boolean>("kevo_schedule_cancel_reminder", { id }),
  kevoScheduleClearReminders: () =>
    call<boolean>("kevo_schedule_clear_reminders"),
  kevoScheduleCheckDue: () =>
    call<Array<{ id: string; message: string; trigger_at: number; created_at: number; fired: boolean; recurring?: string }>>(
      "kevo_schedule_check_due"
    ),
  kevoScheduleTriggerAlert: (title: string, message: string) =>
    call<void>("kevo_schedule_trigger_alert", { title, message }),

  kevoHardwareProfile: () => call<KevoHardwareProfile>("kevo_hardware_profile"),

  openSettingsWindow: () => call<void>("open_settings_window"),
  openWorkspaceWindow: () => call<void>("open_workspace_window"),

  /** Writes to %LOCALAPPDATA%\AnF\coucou.log, next to the Rust lines. */
  log: (message: string) => call<void>("log_line", { message }),

  // ── Claude Code hooks ─────────────────────────────────────────────────────
  hooksStatus: () => call<HookStatus>("hooks_status"),
  /** Diff to show before anything is written. `install: false` previews removal. */
  hooksPreview: (install: boolean) => callOrThrow<HookPreview>("hooks_preview", { install }),
  /**
   * Writes ~/.claude/settings.json — only ever after an explicit click, and only
   * when the file still matches the preview the user looked at.
   */
  hooksApply: (install: boolean, fingerprint: string) =>
    callOrThrow<string>("hooks_apply", { install, fingerprint }),

  approvalDecision: (requestId: string, decision: "allow" | "deny") =>
    call<void>("approval_decision", { requestId, decision }),
  /** "The card is up" — until this lands the relay only waits a moment. */
  approvalAck: (requestId: string) => call<void>("approval_ack", { requestId }),
  /** "Nobody can act on this" — Claude Code asks in the terminal right away. */
  approvalDecline: (requestId: string) => call<void>("approval_decline", { requestId }),

  // ── Kevo Ears (Phase 1 listening pipeline) ──────────────────────────────
  kevoEarsStart: () => call<void>("kevo_ears_start"),
  kevoEarsStop: () => call<void>("kevo_ears_stop"),
  kevoEarsMute: (muted: boolean) => call<void>("kevo_ears_mute", { muted }),
  kevoEarsStatus: () => call<{ running: boolean; muted: boolean }>("kevo_ears_status"),
  kevoEarsModelsInstalled: () => call<boolean>("kevo_ears_models_installed"),
  kevoEarsInstallModels: () => call<void>("kevo_ears_install_models"),

  // ── Chat, files, secrets ──────────────────────────────────────────────────
  /** One chat turn. The API key and any file bytes never leave Rust. */
  chatSend: (query: string, context: ChatContext | null) =>
    callOrThrow<{ text: string; notice?: string }>("chat_send", { query, context }),
  chatReset: () => call<void>("chat_reset"),
  /** Copies a dropped file into the inbox. */
  ingestFile: (path: string) => callOrThrow<DroppedFile>("ingest_file", { path }),
  ingestBytes: (bytes: ArrayBuffer, name: string) => invoke<DroppedFile>("ingest_bytes", bytes, { headers: { "x-file-name": encodeURIComponent(name) } }),
  /** Only ever tells you whether a key exists — never its value. */
  secretPresent: (key: string) => call<boolean>("secret_present", { key }),
  secretSet: (key: string, value: string) => callOrThrow<void>("secret_set", { key, value }),
  secretClear: (key: string) => callOrThrow<void>("secret_clear", { key }),

  // ── Integrations ──────────────────────────────────────────────────────────
  refreshIntegration: (id: string) => call<void>("refresh_integration", { id }),
  /** Opens the configured n8n instance in the browser. */
  openN8n: () => call<void>("open_n8n"),

  /** Tray → Pause. Stops the integration pollers, not just the island. */
  setPaused: (paused: boolean) => call<void>("set_paused", { paused }),
};

export interface IntegrationUpdate {
  id: string;
  data: Record<string, unknown>;
  error: string | null;
  event: { success: boolean; label: string; detail: string | null } | null;
}

export type ChatContext =
  | { kind: "file"; name: string; path: string }
  | { kind: "window"; appName: string; title: string; url?: string };

export interface DroppedFile {
  name: string;
  path: string;
  size: number;
}

export interface HookStatus {
  installed: boolean;
  settingsPath: string;
  hookPath: string;
  hookReady: boolean;
}

export interface HookPreview {
  diff: string;
  backup: string;
  settingsPath: string;
  /** Hand back to hooksApply so only the reviewed diff is ever written. */
  fingerprint: string;
}

/** Same as `call`, but surfaces the error so the UI can show what went wrong. */
async function callOrThrow<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!IS_TAURI) throw new Error("not running inside AnF");
  return invoke<T>(cmd, args);
}

export type BridgeEvent =
  | { name: "cursor"; payload: { x: number; y: number } }
  | { name: "tray"; payload: string }
  | { name: "hook"; payload: Record<string, unknown> }
  | { name: "screen-changed"; payload: null };

export interface DragDropPayload {
  type: "enter" | "over" | "drop" | "leave";
  /** On drop: the first file, already on its way into the inbox. */
  file?: { name: string; ingest: () => Promise<DroppedFile> };
}

/** Bigger than this and the bytes are not worth pushing through the IPC. */
const MAX_DROP_BYTES = 200 * 1024 * 1024;

/**
 * Files dragged onto the island, as a plain HTML5 drag and drop.
 *
 * Tauri's native drop hook (dragDropEnabled) never fires on Windows here: its
 * target sits on a window above the ones WebView2's own process owns, and OLE
 * stops at those first. WebView2 itself delivers the drop to the page without
 * fuss, but hands over the file's contents, not its path — so the contents go
 * to Rust, which writes them into the inbox like any other drop.
 */
export async function onDragDrop(handler: (e: DragDropPayload) => void) {
  if (!IS_TAURI) return () => {};
  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
  // dragenter/dragleave fire for every element crossed; count to know when
  // the drag really enters and leaves the page.
  let depth = 0;

  const enter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (depth++ === 0) handler({ type: "enter" });
  };
  const over = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); // without this the page refuses the drop
    e.dataTransfer!.dropEffect = "copy";
  };
  const leave = (e: DragEvent) => {
    if (!hasFiles(e) || depth === 0) return;
    if (--depth === 0) handler({ type: "leave" });
  };
  const drop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    const file = e.dataTransfer!.files[0];
    const item = e.dataTransfer!.items[0];
    const folder = item?.webkitGetAsEntry?.()?.isDirectory;
    handler(file ? { type: "drop", file: { name: file.name, ingest: () => folder
      ? Promise.reject(new Error("Folders can't be dropped yet.")) : ingestDropped(file) } } : { type: "drop" });
  };

  window.addEventListener("dragenter", enter);
  window.addEventListener("dragover", over);
  window.addEventListener("dragleave", leave);
  window.addEventListener("drop", drop);
  return () => {
    window.removeEventListener("dragenter", enter);
    window.removeEventListener("dragover", over);
    window.removeEventListener("dragleave", leave);
    window.removeEventListener("drop", drop);
  };
}

async function ingestDropped(file: File): Promise<DroppedFile> {
  if (file.size > MAX_DROP_BYTES) throw new Error("That file is too big to drop (200 MB max).");
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    // A folder arrives as a File that cannot be read.
    throw new Error("Folders can't be dropped yet.");
  }
  return invoke<DroppedFile>("ingest_bytes", bytes, {
    headers: { "x-file-name": encodeURIComponent(file.name) },
  });
}

export async function onEvent<T>(name: string, handler: (payload: T) => void) {
  if (!IS_TAURI) return () => {};
  return listen<T>(name, (e) => handler(e.payload));
}
