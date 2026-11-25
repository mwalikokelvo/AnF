import { invoke } from '@tauri-apps/api/core';

export type KevoRoutineStep = {
  action: string;
  target: string;
  label: string;
};

export type KevoRoutinePlan = {
  name: string;
  steps: KevoRoutineStep[];
  resolvedUtterance: string;
};

export type KevoIntentMatch = {
  intent: string;
  entity: string | null;
  confidence: number;
};

export async function matchKevoIntent(
  utterance: string,
  candidates: string[] = [],
): Promise<KevoIntentMatch | null> {
  return invoke<KevoIntentMatch | null>('kevo_match_intent', {
    utterance,
    candidates,
  });
}

export type KevoSelectionAction = {
  action: string;
  prompt: string;
  selectionChars: number;
  truncated: boolean;
};

export type VoiceLatencyStats = {
  sampleCount: number;
  p50TotalMs: number;
  p95TotalMs: number;
};

export async function planSelectionAction(
  utterance: string,
  selection: string,
): Promise<KevoSelectionAction> {
  return invoke<KevoSelectionAction>('kevo_plan_selection_action', {
    utterance,
    selection,
  });
}

export async function recordVoiceTiming(
  sttMs: number,
  intentMs: number,
  ttsMs: number,
): Promise<VoiceLatencyStats> {
  return invoke<VoiceLatencyStats>('kevo_record_voice_timing', {
    sttMs,
    intentMs,
    ttsMs,
  });
}

export type KevoPaletteCommand = {
  id: string;
  title: string;
  category: string;
  shortcut: string;
  keywords: string;
};

export async function searchKevoCommands(query = ''): Promise<KevoPaletteCommand[]> {
  return invoke<KevoPaletteCommand[]>('kevo_search_commands', { query });
}

export async function pushKevoContextEntity(
  kind: 'file' | 'note' | 'track' | 'book',
  value: string,
): Promise<void> {
  return invoke('kevo_push_context_entity', { kind, value });
}

export async function resolveContextualUtterance(utterance: string): Promise<string> {
  return invoke<string>('kevo_resolve_contextual_utterance', { utterance });
}

/** Atomically bumps the Rust barge-in epoch to cancel any in-flight Kevo speech/stream. */
export async function bargeInInterrupt(): Promise<number> {
  return invoke<number>('kevo_barge_in_interrupt');
}

export async function resolveKevoAnaphora(
  utterance: string,
  lastEntity?: string | null,
): Promise<string> {
  return invoke<string>('kevo_resolve_anaphora', {
    utterance,
    lastEntity: lastEntity ?? null,
  });
}

export async function resolveKevoRoutine(
  utterance: string,
  lastEntity?: string | null,
): Promise<KevoRoutinePlan | null> {
  return invoke<KevoRoutinePlan | null>('kevo_resolve_routine', {
    utterance,
    lastEntity: lastEntity ?? null,
  });
}
