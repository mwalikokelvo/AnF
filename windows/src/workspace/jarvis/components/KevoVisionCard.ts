/**
 * KEVO On-Demand Vision Card
 * ─────────────────────────────────────────────
 * Desktop / webcam "inspect the desk or screen" card.
 *
 * Behaviour:
 *  - Activated ONLY by an explicit wake phrase ("Kevo, look at my desk / screen").
 *  - Never auto-starts and never holds a camera/screen stream idle.
 *  - Releases every MediaStream track the moment the card is closed so idle
 *    RAM returns to 0 MB.
 *  - HUD bounding-box overlays draw the "research" view on the live feed.
 */

/** A single normalized (0..1) bounding box drawn on the live video frame. */
export interface KevoVisionBox {
  /** Left, normalized to the frame width. */
  x: number;
  /** Top, normalized to the frame height. */
  y: number;
  /** Width, normalized. */
  w: number;
  /** Height, normalized. */
  h: number;
  /** Optional label rendered inside / above the box. */
  label?: string;
  /** Optional box stroke colour. Defaults to the card colour. */
  color?: string;
}

export interface KevoResearchCanvasOptions {
  /** Box glow / stroke colour. Default '#00e6ff'. */
  boxColor?: string;
  /** Draw a centre crosshair. Default true. */
  crosshair?: boolean;
}

/** Drawing surface + HUD overlay renderer. Owns the canvas element only —
 *  it never opens or closes any MediaStream. */
export class KevoResearchCanvas {
  /** The overlay canvas. Sized to match the video frame. */
  public readonly canvas: HTMLCanvasElement;
  private readonly boxColor: string;
  private readonly crosshair: boolean;
  private boxes: KevoVisionBox[] = [];
  private destroyed = false;
  private ctx: CanvasRenderingContext2D | null = null;

  constructor(options: KevoResearchCanvasOptions = {}) {
    this.boxColor = options.boxColor ?? '#00e6ff';
    this.crosshair = options.crosshair ?? true;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'kevo-overlay';
    this.ctx = this.canvas.getContext('2d');
    if (this.ctx) {
      this.resizeTo(640, 360);
    }
  }

  /** Append the overlay canvas into a container. No-op if already attached. */
  mount(container: HTMLElement): void {
    if (this.canvas.parentElement === container) return;
    container.appendChild(this.canvas);
  }

  setBoxes(boxes: KevoVisionBox[]): void {
    this.boxes = boxes;
  }

  /**
   * Draw the current video frame + HUD bounding boxes onto the canvas.
   * Resizes the canvas internal buffer to match the frame resolution.
   */
  draw(video: HTMLVideoElement): void {
    if (this.destroyed || !this.ctx || !this.canvas) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.resizeTo(w, h);
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(video, 0, 0, w, h);

    for (const box of this.boxes) {
      this.drawBox(ctx, box, w, h);
    }

    if (this.crosshair) {
      this.drawCrosshair(ctx, w, h);
    }
  }

  resizeTo(width: number, height: number): void {
    if (!this.canvas) return;
    this.canvas.width = Math.max(1, Math.round(width));
    this.canvas.height = Math.max(1, Math.round(height));
  }

  destroy(): void {
    this.destroyed = true;
  }

  private drawBox(ctx: CanvasRenderingContext2D, box: KevoVisionBox, frameW: number, frameH: number): void {
    const x = box.x * frameW;
    const y = box.y * frameH;
    const w = box.w * frameW;
    const h = box.h * frameH;
    const color = box.color ?? this.boxColor;
    const bw = Math.max(2, Math.round(w) - 2);
    const bh = Math.max(2, Math.round(h) - 2);

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, 'rgba(0,230,255,0.22)');
    grad.addColorStop(1, 'rgba(0,230,255,0.04)');
    ctx.fillStyle = grad;
    ctx.fillRect(x + 1, y + 1, bw, bh);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x + 1, y + 1, bw, bh);
    ctx.setLineDash([]);

    if (box.label) {
      ctx.fillStyle = 'rgba(125,232,255,0.9)';
      ctx.font = '10px "Courier New", Courier, monospace';
      ctx.fillText(box.label, x + 4, y + 10);
    }
    ctx.restore();
  }

  private drawCrosshair(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const c = Math.max(4, Math.min(w, h) * 0.06);
    ctx.save();
    ctx.strokeStyle = 'rgba(0,230,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - c, h / 2);
    ctx.lineTo(w / 2 + c, h / 2);
    ctx.moveTo(w / 2, h / 2 - c);
    ctx.lineTo(w / 2, h / 2 + c);
    ctx.stroke();
    ctx.restore();
  }
}

/** Default, clearly-legible bounding boxes for the research view. */
function defaultBoxes(boxCount: number): KevoVisionBox[] {
  const labels = ['FOCUS', 'LEFT', 'RIGHT', 'UP', 'DOWN'];
  const colors = ['#00e6ff', '#ffd23f', '#ff3f3f', '#3f7eff', '#3fff6f'];
  const specs: Array<Pick<KevoVisionBox, 'x' | 'y' | 'w' | 'h'>> = [
    { x: 0.35, y: 0.35, w: 0.3, h: 0.3 }, // focus
    { x: 0.1, y: 0.3, w: 0.2, h: 0.4 }, // left
    { x: 0.7, y: 0.3, w: 0.2, h: 0.4 }, // right
    { x: 0.35, y: 0.05, w: 0.3, h: 0.18 }, // up
    { x: 0.35, y: 0.77, w: 0.3, h: 0.18 }, // down
  ];
  const count = Math.min(boxCount, labels.length);
  const out: KevoVisionBox[] = [];
  for (let i = 0; i < count; i++) {
    const s = specs[i];
    out.push({
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      label: labels[i],
      color: colors[i],
    });
  }
  return out;
}

export interface KevoVisionCardOptions {
  container?: string;
  boxCount?: number;
  boxColor?: string;
  crosshair?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  onStatus?: (status: KevoVisionCardStatus) => void;
}

export type KevoVisionCardStatus = 'idle' | 'capturing' | 'stopped';

/**
 * KEVO On-Demand Vision Card.
 * Owns the card DOM, the MediaStream tracks, and the HUD overlays.
 * Auto-release: close() stops every track immediately and drops the stream
 * references so idle RAM returns to 0 MB.
 */
export class KevoVisionCard {
  private readonly options: KevoVisionCardOptions;
  private root: HTMLElement | null = null;
  private container: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private cameraView: { element: HTMLDivElement; video: HTMLVideoElement; canvas: KevoResearchCanvas } | null =
    null;
  private screenView: { element: HTMLDivElement; video: HTMLVideoElement; canvas: KevoResearchCanvas } | null =
    null;
  private cameraStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private capturing = false;
  private destroyed = false;
  private tickTimer: number | null = null;
  private boxes: KevoVisionBox[] = [];

  constructor(options: KevoVisionCardOptions = {}) {
    this.options = {
      boxCount: 3,
      boxColor: '#00e6ff',
      crosshair: true,
      onOpen: () => {
        /* no-op – wired by host */
      },
      onClose: () => {
        /* no-op – wired by host */
      },
      onStatus: () => {
        /* no-op – wired by host */
      },
      ...options,
    };
    this.boxes = defaultBoxes(this.options.boxCount ?? 3);
  }

  /** Open the on-demand card (only reachable from a voice wake phrase). */
  open(): void {
    if (this.capturing) return;
    this.destroyed = false;
    this.capturing = true;

    // Mount into the host container (or document.body).
    const root = document.querySelector<HTMLElement>(this.options.container ?? '#kevo-vision-card-root');
    this.container = root ?? document.body;
    this.root = this.mountCard();
    this.root.hidden = false;

    this.statusEl!.textContent = 'Capturing desk & screen…';
    this.boxes = defaultBoxes(this.options.boxCount ?? 3);
    this.startCapture();
    this.options.onOpen?.();
    this.options.onStatus?.('capturing');
  }

  /** Close the card and release every MediaStream track immediately. */
  close(): void {
    if (!this.capturing) return;
    this.capturing = false;

    if (this.tickTimer !== null) {
      cancelAnimationFrame(this.tickTimer);
      this.tickTimer = null;
    }

    this.releaseStreams();
    if (this.root !== null) {
      this.root.hidden = true;
    }
    this.options.onClose?.();
    this.options.onStatus?.('stopped');
    this.pulse('Desk & screen view closed');
  }

  /** Full teardown – releases remaining DOM and references. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.capturing) {
      this.capturing = false;
      if (this.tickTimer !== null) {
        cancelAnimationFrame(this.tickTimer);
        this.tickTimer = null;
      }
      this.releaseStreams();
    }
    if (this.root !== null && this.container !== null) {
      this.container.removeChild(this.root);
    }
    this.root = null;
    this.container = null;
    this.statusEl = null;
    this.cameraView = null;
    this.screenView = null;
    this.cameraStream = null;
    this.screenStream = null;
  }

  isOpen(): boolean {
    return this.capturing;
  }

  setBoxes(boxes: KevoVisionBox[]): void {
    this.boxes = boxes;
  }

  private mountCard(): HTMLElement {
    if (this.root) return this.root;

    this.root = document.createElement('div');
    this.root.className = 'kevo-vision-card';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'KEVO desk & screen inspection');

    // ── Head ──────────────────────────────────────────────
    const head = document.createElement('div');
    head.className = 'kevo-vision-head';
    const title = document.createElement('div');
    title.className = 'kevo-vision-title';
    title.textContent = '⬡ KEVO VISION';
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'kevo-vision-status';
    this.statusEl.id = 'kevo-vision-status';
    this.statusEl.textContent = 'READY';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'kevo-vision-close';
    closeBtn.setAttribute('aria-label', 'Close vision card');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.close());
    head.append(title, this.statusEl, closeBtn);

    // ── Main view (camera + screen) ───────────────────────
    const main = document.createElement('div');
    main.className = 'kevo-vision-main';

    this.cameraView = this.createView('camera');
    main.append(this.cameraView.element);

    this.screenView = this.createView('screen');
    main.append(this.screenView.element);

    this.root.append(head, main);

    // ── Foot ──────────────────────────────────────────────
    const foot = document.createElement('div');
    foot.className = 'kevo-vision-foot';
    foot.textContent =
      'On-demand desk & screen inspection · say "Kevo, stop looking" to close.';
    this.root.append(foot);

    this.injectStyles();
    return this.root;
  }

  private createView(label: 'camera' | 'screen'): {
    element: HTMLDivElement;
    video: HTMLVideoElement;
    canvas: KevoResearchCanvas;
  } {
    const wrap = document.createElement('div');
    wrap.className = `kevo-vision-view kevo-vision-view-${label}`;

    const video = document.createElement('video');
    video.className = 'kevo-video';
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('muted', '');
    video.setAttribute('aria-label', `KEVO ${label} view`);

    const canvas = new KevoResearchCanvas({
      boxColor: this.options.boxColor,
      crosshair: this.options.crosshair,
    });
    canvas.mount(wrap);

    return { element: wrap, video, canvas };
  }

  private startCapture(): void {
    const onCameraReady = () => {
      this.attachCameraVideo();
      this.ensureReady();
      this.captureScreen().then(() => {
        this.attachScreenVideo();
        this.ensureReady();
      }).catch((err: unknown) => {
        this.handleCaptureError(err, 'screen (optional)');
      });
    };

    this.captureCamera().then(onCameraReady).catch((err: unknown) => {
      this.handleCaptureError(err, 'camera');
    });
  }

  private async captureCamera(): Promise<void> {
    const devices = navigator.mediaDevices;
    if (!devices) throw new Error('MediaDevices unavailable');
    const stream = await devices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.cameraStream = stream;
  }

  private async captureScreen(): Promise<void> {
    const devices = navigator.mediaDevices;
    if (!devices) throw new Error('MediaDevices unavailable');
    const stream = await devices.getDisplayMedia({ video: true });
    this.screenStream = stream;
  }

  private attachCameraVideo(): void {
    if (this.cameraView !== null && this.cameraStream !== null) {
      this.cameraView.video.srcObject = this.cameraStream;
    }
  }

  private attachScreenVideo(): void {
    if (this.screenView !== null && this.screenStream !== null) {
      this.screenView.video.srcObject = this.screenStream;
    }
  }

  private ensureReady(): void {
    if (!this.capturing) return;
    const hasCamera = this.cameraView !== null && this.cameraView.video.readyState > 0;
    const hasScreen = this.screenView !== null && this.screenView.video.readyState > 0;
    if (hasCamera || hasScreen) {
      this.startTick();
    }
  }

  private startTick(): void {
    if (this.tickTimer !== null) return;
    this.tick();
  }

  private tick = (): void => {
    if (this.destroyed || !this.capturing) return;

    if (this.cameraView !== null && this.cameraView.video.videoWidth > 0) {
      this.cameraView.canvas.setBoxes(this.boxes);
      this.cameraView.canvas.draw(this.cameraView.video);
    }
    if (this.screenView !== null && this.screenView.video.videoWidth > 0) {
      this.screenView.canvas.setBoxes(this.boxes);
      this.screenView.canvas.draw(this.screenView.video);
    }

    this.tickTimer = requestAnimationFrame(this.tick);
  };

  private releaseStreams(): void {
    const stop = (stream: MediaStream | null) => {
      if (!stream) return;
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* already stopped */
        }
      }
    };
    stop(this.cameraStream);
    stop(this.screenStream);
    this.cameraStream = null;
    this.screenStream = null;
  }

  private handleCaptureError(err: unknown, stage: string): void {
    this.pulse(`Capture ${stage} failed: ${String(err)}`);
  }

  private pulse(msg: string): void {
    if (this.statusEl !== null) {
      this.statusEl.textContent = msg;
    }
  }

  private injectStyles(): void {
    if (document.getElementById('kevo-vision-card-styles')) return;
    const style = document.createElement('style');
    style.id = 'kevo-vision-card-styles';
    style.textContent = `
      .kevo-vision-card {
        position: fixed;
        inset: 16px;
        z-index: 2147483647;
        width: calc(100vw - 32px);
        max-width: 1280px;
        background: rgba(2,13,20,0.96);
        border: 1px solid #0af;
        border-radius: 10px;
        box-shadow: 0 0 24px rgba(0,170,255,0.35), inset 0 0 12px rgba(0,170,255,0.05);
        color: #7de8ff;
        font-family: 'Courier New', Courier, monospace;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .kevo-vision-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid rgba(0,170,255,0.25);
        background: rgba(0,170,255,0.05);
      }
      .kevo-vision-title {
        font-size: 12px;
        letter-spacing: 0.12em;
        color: #0af;
        font-weight: bold;
      }
      .kevo-vision-status {
        font-size: 10px;
        color: #00ff88;
        letter-spacing: 0.05em;
      }
      .kevo-vision-close {
        border: 1px solid rgba(0,170,255,0.3);
        background: rgba(0,170,255,0.1);
        color: #7de8ff;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        padding: 2px 8px;
        line-height: 1;
      }
      .kevo-vision-close:hover {
        background: rgba(0,170,255,0.22);
      }
      .kevo-vision-main {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
        flex: 1;
      }
      .kevo-vision-view { position: relative; display: flex; }
      .kevo-vision-view .kevo-video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        background: #020d14;
      }
      .kevo-vision-view .kevo-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        display: block;
      }
      .kevo-vision-foot {
        padding: 8px 12px;
        color: rgba(125,232,255,0.45);
        font-size: 10px;
        border-top: 1px solid rgba(0,170,255,0.12);
      }
    `;
    document.head.appendChild(style);
  }
}
