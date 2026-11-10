import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSystemTelemetry, setAudioEngineStatus, startTelemetryPolling } from '../src/workspace/jarvis/connectors/system-connector';
import { RevenueConnector, formatUsdCents } from '../src/workspace/jarvis/connectors/revenue-connector';
import { AdsConnector, formatAdSpend } from '../src/workspace/jarvis/connectors/ads-connector';

describe('SystemTelemetry Connector', () => {
  it('fetchSystemTelemetry returns valid shape', async () => {
    const t = await fetchSystemTelemetry();
    assert.ok(t.cpuLoadPct >= 0 && t.cpuLoadPct <= 100, 'cpu 0-100');
    assert.ok(t.memoryUsedMb >= 0, 'memory >= 0');
    assert.ok(t.memoryTotalMb >= 0, 'total >= 0');
    assert.ok(t.memoryUsedPct >= 0 && t.memoryUsedPct <= 100, 'memPct 0-100');
    assert.ok(t.networkRxKbps >= 0, 'rx >= 0');
    assert.ok(t.networkTxKbps >= 0, 'tx >= 0');
    assert.ok(['idle', 'playing', 'processing'].includes(t.audioEngineStatus), 'valid audio status');
    assert.ok(t.activeProcesses > 0, 'processes > 0');
    assert.ok(t.timestamp > 0, 'timestamp > 0');
  });

  it('setAudioEngineStatus changes detected status', async () => {
    setAudioEngineStatus('playing');
    const t = await fetchSystemTelemetry();
    assert.strictEqual(t.audioEngineStatus, 'playing');
    setAudioEngineStatus('idle');
  });

  it('startTelemetryPolling calls back and can be stopped', async () => {
    const calls: number[] = [];
    const stop = startTelemetryPolling(t => calls.push(t.timestamp), 50);
    await new Promise(r => setTimeout(r, 180));
    stop();
    assert.ok(calls.length >= 2, `expected >=2 polls, got ${calls.length}`);
  });
});

describe('RevenueConnector', () => {
  it('demo mode returns expected MRR', async () => {
    const c = new RevenueConnector();
    const s = await c.getStats();
    assert.ok(s.isDemo, 'isDemo=true');
    assert.strictEqual(s.mrr, 3_000_000, 'MRR = $30,000');
    assert.strictEqual(s.newCustomers7d, 2_459, 'new customers matches video');
  });

  it('setDemoMode toggle works', async () => {
    const c = new RevenueConnector('fake-key-1234567890');
    c.setDemoMode(true);
    const s = await c.getStats();
    assert.ok(s.isDemo, 'still demo after toggle');
  });

  it('formatUsdCents formats correctly', () => {
    assert.ok(formatUsdCents(3_000_000).includes('30,000'), 'formats $30,000');
    assert.ok(formatUsdCents(47_500).includes('475'), 'formats $475');
  });
});

describe('AdsConnector', () => {
  it('demo mode returns video values', async () => {
    const c = new AdsConnector();
    const s = await c.getStats();
    assert.ok(s.isDemo, 'isDemo=true');
    assert.strictEqual(s.totalSpend, 47_500, '$475 spend');
    assert.strictEqual(s.roas, 1.5, '1.5x ROAS');
  });

  it('period param changes returned period', async () => {
    const c = new AdsConnector();
    const s = await c.getStats('30d');
    assert.strictEqual(s.period, '30d');
  });

  it('formatAdSpend works', () => {
    assert.ok(formatAdSpend(47_500).includes('475'), 'formats spend');
  });
});
