/**
 * Paperclip Autonomous Heartbeat Engine for AnF
 * 
 * Provides periodic, low-overhead background execution for maintenance,
 * indexing, feed updates, and health auditing without UI hitching.
 * Inspired by paperclipai/paperclip.
 */

export interface HeartbeatJob {
  id: string;
  name: string;
  intervalMinutes: number;
  lastRun?: number;
  run: () => Promise<void>;
}

export interface HeartbeatStats {
  tickCount: number;
  lastTickTime: number;
  jobsRun: number;
  errors: Array<{ jobId: string; error: string; timestamp: number }>;
}

export class PaperclipHeartbeat {
  private jobs = new Map<string, HeartbeatJob>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private isTicking = false;
  private stats: HeartbeatStats = {
    tickCount: 0,
    lastTickTime: 0,
    jobsRun: 0,
    errors: [],
  };

  constructor(private tickIntervalMs = 60_000) {}

  registerJob(job: HeartbeatJob): void {
    this.jobs.set(job.id, job);
  }

  unregisterJob(jobId: string): void {
    this.jobs.delete(jobId);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getStats(): HeartbeatStats {
    return { ...this.stats, errors: [...this.stats.errors] };
  }

  async tick(now = Date.now()): Promise<number> {
    if (this.isTicking) return 0;
    this.isTicking = true;
    this.stats.tickCount++;
    this.stats.lastTickTime = now;
    let executed = 0;

    for (const [id, job] of this.jobs.entries()) {
      const intervalMs = job.intervalMinutes * 60_000;
      const shouldRun = !job.lastRun || (now - job.lastRun) >= intervalMs;

      if (shouldRun) {
        try {
          await job.run();
          job.lastRun = now;
          executed++;
          this.stats.jobsRun++;
        } catch (err: any) {
          this.stats.errors.push({
            jobId: id,
            error: err?.message || String(err),
            timestamp: now,
          });
          if (this.stats.errors.length > 50) this.stats.errors.shift();
        }
      }
    }

    this.isTicking = false;
    return executed;
  }
}
