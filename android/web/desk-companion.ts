/**
 * Kevo Android Desk Companion View (Phase 8 Step 8.1 / HUD Step H.7)
 *
 * Turns Android phone into a tactile desk companion dock for PC Kevo:
 * - Animated glowing Kevo orb / eyes with state-driven CSS transitions
 * - Speech loudness level waveform animation (0 to 1)
 * - Ergonomic Hold-to-Talk button with native haptic feedback
 * - Remote Action Approval Card (HUD H.4)
 * - Orientation-resilient (portrait dock & landscape stand modes)
 */

import { h } from '../../windows/src/views/dom';

export type DeskCompanionState = 'off' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'alert';

export interface DeskCompanionApprovalRequest {
  id: string;
  action: string;
  summary: string;
}

export interface DeskCompanionOptions {
  onHoldToTalkStart?: () => void;
  onHoldToTalkEnd?: () => void;
  onExit?: () => void;
  onApprove?: (id: string, approved: boolean) => void;
  notify?: (msg: string) => void;
}

const STATE_MESSAGES: Record<DeskCompanionState, string> = {
  off: 'Kevo is offline',
  idle: 'Say “Kevo” or hold to talk',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  alert: 'Action requires approval',
};

export class DeskCompanionView {
  readonly root: HTMLElement;
  private state: DeskCompanionState = 'idle';
  private level: number = 0;
  private activeApproval: DeskCompanionApprovalRequest | null = null;
  private approvalTimeoutTimer?: ReturnType<typeof setTimeout>;

  private readonly orbEl: HTMLElement;
  private readonly coreEl: HTMLElement;
  private readonly statusLineEl: HTMLElement;
  private readonly subtitleEl: HTMLElement;
  private readonly waveformBars: HTMLElement[] = [];
  private readonly holdBtn: HTMLElement;
  private readonly approvalCard: HTMLElement;
  private readonly approvalSummary: HTMLElement;
  private readonly approvalAction: HTMLElement;
  private readonly connectionBadge: HTMLElement;

  constructor(private readonly options: DeskCompanionOptions = {}) {
    // ── Build Orb
    this.coreEl = h('div', { class: 'desk-kevo-core' },
      h('div', { class: 'desk-kevo-eye left' }),
      h('div', { class: 'desk-kevo-eye right' }),
    );

    this.orbEl = h('div', { class: 'desk-kevo-orb', 'data-state': 'idle' },
      h('div', { class: 'desk-kevo-ring outer' }),
      h('div', { class: 'desk-kevo-ring inner' }),
      this.coreEl,
    );

    // ── Build Waveform Visualizer
    const waveformEl = h('div', { class: 'desk-kevo-waveform', 'aria-hidden': 'true' });
    for (let i = 0; i < 7; i++) {
      const bar = h('span', { class: 'desk-waveform-bar' });
      this.waveformBars.push(bar);
      waveformEl.append(bar);
    }

    // ── Build Status Display
    this.statusLineEl = h('h2', { class: 'desk-kevo-status', text: STATE_MESSAGES.idle });
    this.subtitleEl = h('p', { class: 'desk-kevo-sub', text: 'Desk Companion Active · Local Wi-Fi' });

    this.connectionBadge = h('span', {
      class: 'desk-connection-badge connected',
      text: '● PC Connected',
    });

    // ── Exit Button
    const exitBtn = h('button', {
      type: 'button',
      class: 'desk-exit-btn',
      text: '✕ Workspace',
      onclick: () => this.options.onExit?.(),
    });

    // ── Hold-to-Talk Button
    this.holdBtn = h('button', {
      type: 'button',
      class: 'desk-hold-talk-btn',
      text: '🎙 Hold to talk',
    });

    this.attachHoldListeners();

    // ── Remote Approval Card (HUD H.4)
    this.approvalAction = h('h3', { class: 'desk-approval-title', text: '' });
    this.approvalSummary = h('p', { class: 'desk-approval-summary', text: '' });
    const approveBtn = h('button', {
      type: 'button',
      class: 'desk-approve-btn primary',
      text: '✓ Approve',
      onclick: () => this.handleApproval(true),
    });
    const denyBtn = h('button', {
      type: 'button',
      class: 'desk-deny-btn',
      text: '✕ Deny',
      onclick: () => this.handleApproval(false),
    });

    this.approvalCard = h('div', { class: 'desk-approval-card', hidden: true },
      h('div', { class: 'desk-approval-header', text: 'Approval Required' }),
      this.approvalAction,
      this.approvalSummary,
      h('div', { class: 'desk-approval-actions' }, approveBtn, denyBtn),
    );

    // ── Root assembly
    this.root = h('div', { class: 'desk-companion-container' },
      h('header', { class: 'desk-companion-header' },
        this.connectionBadge,
        exitBtn,
      ),
      h('main', { class: 'desk-companion-stage' },
        this.orbEl,
        waveformEl,
        this.statusLineEl,
        this.subtitleEl,
        this.approvalCard,
      ),
      h('footer', { class: 'desk-companion-footer' },
        this.holdBtn,
      ),
    );

    this.applyState('idle');
  }

  private attachHoldListeners(): void {
    let pressed = false;

    const start = (e: Event) => {
      e.preventDefault();
      if (pressed) return;
      pressed = true;
      this.holdBtn.classList.add('active');
      this.holdBtn.textContent = 'Listening… (Release to send)';
      try { (window as any).AnFAndroid?.haptic?.(); } catch {}
      this.options.onHoldToTalkStart?.();
    };

    const end = (e: Event) => {
      e.preventDefault();
      if (!pressed) return;
      pressed = false;
      this.holdBtn.classList.remove('active');
      this.holdBtn.textContent = '🎙 Hold to talk';
      try { (window as any).AnFAndroid?.haptic?.(); } catch {}
      this.options.onHoldToTalkEnd?.();
    };

    this.holdBtn.addEventListener('touchstart', start, { passive: false });
    this.holdBtn.addEventListener('touchend', end, { passive: false });
    this.holdBtn.addEventListener('touchcancel', end, { passive: false });
    this.holdBtn.addEventListener('mousedown', start);
    this.holdBtn.addEventListener('mouseup', end);
    this.holdBtn.addEventListener('mouseleave', end);
  }

  /** Update Kevo state (idle, listening, thinking, speaking, alert, off) */
  setState(newState: DeskCompanionState, subtitle?: string): void {
    this.state = newState;
    this.applyState(newState, subtitle);
  }

  getState(): DeskCompanionState {
    return this.state;
  }

  private applyState(state: DeskCompanionState, subtitle?: string): void {
    this.orbEl.setAttribute('data-state', state);
    this.root.setAttribute('data-state', state);
    this.statusLineEl.textContent = STATE_MESSAGES[state] || state;
    if (subtitle !== undefined) {
      this.subtitleEl.textContent = subtitle;
    }

    if (state !== 'speaking' && state !== 'listening') {
      this.setLevel(0);
    }
  }

  /** Update speech loudness level (0 to 1) */
  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level));
    const heights = [0.2, 0.45, 0.8, 1.0, 0.8, 0.45, 0.2];
    for (let i = 0; i < this.waveformBars.length; i++) {
      const scale = this.level > 0.05 ? Math.max(0.15, heights[i] * this.level * 1.4) : 0.12;
      this.waveformBars[i].style.transform = `scaleY(${scale.toFixed(2)})`;
    }
    // Subtle core pulse
    if (this.coreEl) {
      const coreScale = 1.0 + this.level * 0.12;
      this.coreEl.style.transform = `scale(${coreScale.toFixed(2)})`;
    }
  }

  getLevel(): number {
    return this.level;
  }

  /** Update connection indicator */
  setConnected(connected: boolean, hostName?: string): void {
    this.connectionBadge.className = `desk-connection-badge ${connected ? 'connected' : 'disconnected'}`;
    this.connectionBadge.textContent = connected
      ? `● ${hostName ? `${hostName} Connected` : 'PC Connected'}`
      : '○ Offline (Local Phone)';
  }

  /** Display an approval request from PC Kevo (HUD Step H.4 / Step 8.3) */
  showApprovalRequest(request: DeskCompanionApprovalRequest, timeoutMs?: number): void {
    clearTimeout(this.approvalTimeoutTimer);
    this.approvalTimeoutTimer = undefined;
    this.activeApproval = request;
    this.approvalAction.textContent = request.action;
    this.approvalSummary.textContent = request.summary;
    this.approvalCard.hidden = false;
    this.setState('alert', 'Approval Required');

    if (timeoutMs && timeoutMs > 0) {
      this.approvalTimeoutTimer = setTimeout(() => {
        if (this.activeApproval?.id === request.id) {
          this.dismissApproval();
          this.options.notify?.('Approval request timed out.');
        }
      }, timeoutMs);
    }
  }

  /** Dismiss active approval request */
  dismissApproval(): void {
    clearTimeout(this.approvalTimeoutTimer);
    this.approvalTimeoutTimer = undefined;
    this.activeApproval = null;
    this.approvalCard.hidden = true;
    if (this.state === 'alert') {
      this.setState('idle', 'Desk Companion Active');
    }
  }

  getActiveApproval(): DeskCompanionApprovalRequest | null {
    return this.activeApproval;
  }

  private handleApproval(approved: boolean): void {
    if (!this.activeApproval) return;
    const id = this.activeApproval.id;
    this.dismissApproval();
    this.options.onApprove?.(id, approved);
    try { (window as any).AnFAndroid?.haptic?.(); } catch {}
  }
}

export function createDeskCompanionView(options?: DeskCompanionOptions): DeskCompanionView {
  return new DeskCompanionView(options);
}
