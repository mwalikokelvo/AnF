/**
 * Kevo Wi-Fi State Bus & Pairing RPC (Phase 8 Step 8.2)
 *
 * Coordinates real-time Kevo companion state between Windows PC and Android over local Wi-Fi pairing:
 * - Emits state stream (idle, listening, thinking, speaking, alert, off)
 * - Broadcasts speech loudness levels (0 to 1)
 * - Routes remote voice commands from phone to PC
 * - Handles remote approval card interactions
 */

export interface KevoLinkState {
  state: 'off' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'alert';
  line: string;
  badge: string;
  level: number;
  pendingApproval?: {
    id: string;
    action: string;
    summary: string;
  } | null;
}

export type StateListener = (state: KevoLinkState) => void;

export class KevoLinkBus {
  private currentState: KevoLinkState = {
    state: 'idle',
    line: 'Kevo Online',
    badge: 'Local Wi-Fi',
    level: 0,
    pendingApproval: null,
  };

  private listeners: Set<StateListener> = new Set();
  private commandHandler?: (cmd: string) => Promise<string | void>;
  private approvalHandler?: (id: string, approved: boolean) => void;

  getState(): KevoLinkState {
    return { ...this.currentState };
  }

  setState(partial: Partial<KevoLinkState>): void {
    this.currentState = {
      ...this.currentState,
      ...partial,
    };
    this.broadcast();
  }

  setLevel(level: number): void {
    const clamped = Math.max(0, Math.min(1, level));
    if (Math.abs(this.currentState.level - clamped) > 0.02) {
      this.currentState.level = clamped;
      this.broadcast();
    }
  }

  setPendingApproval(req: { id: string; action: string; summary: string } | null): void {
    this.currentState.pendingApproval = req;
    if (req) {
      this.currentState.state = 'alert';
      this.currentState.line = 'Approval required';
    } else if (this.currentState.state === 'alert') {
      this.currentState.state = 'idle';
      this.currentState.line = 'Kevo Online';
    }
    this.broadcast();
  }

  subscribe(fn: StateListener): () => void {
    this.listeners.add(fn);
    fn(this.getState());
    return () => this.listeners.delete(fn);
  }

  setCommandHandler(handler: (cmd: string) => Promise<string | void>): void {
    this.commandHandler = handler;
  }

  setApprovalHandler(handler: (id: string, approved: boolean) => void): void {
    this.approvalHandler = handler;
  }

  async dispatchRemoteCommand(query: string): Promise<{ ok: boolean; reply?: string }> {
    if (!this.commandHandler) {
      return { ok: true, reply: `Received command: ${query}` };
    }
    try {
      const res = await this.commandHandler(query);
      return { ok: true, reply: res ?? undefined };
    } catch (err) {
      return { ok: false, reply: String(err) };
    }
  }

  resolveRemoteApproval(id: string, approved: boolean): { ok: boolean } {
    if (this.currentState.pendingApproval?.id === id) {
      this.setPendingApproval(null);
    }
    this.approvalHandler?.(id, approved);
    return { ok: true };
  }

  private broadcast(): void {
    const s = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(s);
      } catch {}
    }
  }
}

export const kevoLinkBus = new KevoLinkBus();
