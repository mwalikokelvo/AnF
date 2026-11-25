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
