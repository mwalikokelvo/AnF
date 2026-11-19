import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KevoLinkBus } from '../src/workspace/jarvis/kevo-link-bus';

test('KevoLinkBus: initial state has idle and zero loudness', () => {
  const bus = new KevoLinkBus();
  const state = bus.getState();
  assert.equal(state.state, 'idle');
  assert.equal(state.level, 0);
  assert.equal(state.pendingApproval, null);
});

test('KevoLinkBus: state updates notify subscribers', () => {
  const bus = new KevoLinkBus();
  const history: string[] = [];

  const unsubscribe = bus.subscribe((s) => {
    history.push(s.state);
  });

  bus.setState({ state: 'listening', line: 'Listening…' });
  bus.setState({ state: 'thinking', line: 'Thinking…' });
  bus.setState({ state: 'speaking', line: 'Speaking…' });

  assert.deepEqual(history, ['idle', 'listening', 'thinking', 'speaking']);
  unsubscribe();

  bus.setState({ state: 'idle' });
  assert.deepEqual(history, ['idle', 'listening', 'thinking', 'speaking'], 'Unsubscribed listener receives no further updates');
});

test('KevoLinkBus: level changes clamp and ignore tiny jitter', () => {
  const bus = new KevoLinkBus();
  let latestLevel = 0;
  bus.subscribe((s) => {
    latestLevel = s.level;
  });

  bus.setLevel(0.8);
  assert.equal(latestLevel, 0.8);

  // Tiny delta (< 0.02) should not trigger broadcast
  bus.setLevel(0.81);
  assert.equal(latestLevel, 0.8);

  // Clamped to [0, 1]
  bus.setLevel(1.5);
  assert.equal(latestLevel, 1.0);

  bus.setLevel(-0.5);
  assert.equal(latestLevel, 0.0);
});

test('KevoLinkBus: pending approval workflow transitions state to alert and resolves', () => {
  const bus = new KevoLinkBus();
  let approvalResult: { id: string; approved: boolean } | null = null;

  bus.setApprovalHandler((id, approved) => {
    approvalResult = { id, approved };
  });

  bus.setPendingApproval({
    id: 'req-42',
    action: 'deploy_production',
    summary: 'Deploy main to production server',
  });

  assert.equal(bus.getState().state, 'alert');
  assert.equal(bus.getState().line, 'Approval required');
  assert.equal(bus.getState().pendingApproval?.id, 'req-42');

  const res = bus.resolveRemoteApproval('req-42', true);
  assert.equal(res.ok, true);
  assert.deepEqual(approvalResult, { id: 'req-42', approved: true });
  assert.equal(bus.getState().pendingApproval, null);
  assert.equal(bus.getState().state, 'idle');
});

test('KevoLinkBus: dispatchRemoteCommand routes to handler', async () => {
  const bus = new KevoLinkBus();
  bus.setCommandHandler(async (cmd) => {
    return `Executed: ${cmd.toUpperCase()}`;
  });

  const res = await bus.dispatchRemoteCommand('open notes');
  assert.equal(res.ok, true);
  assert.equal(res.reply, 'Executed: OPEN NOTES');
});
