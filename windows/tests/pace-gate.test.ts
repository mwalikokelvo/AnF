import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PaceGate } from '../src/workspace/pace-gate';
import { audiusPaceGate, searchAudius, DISCOVERY_NODES } from '../src/workspace/audius';

describe('PaceGate (Adaptive Request Pacing & Cooldown)', () => {
  let gate: PaceGate;

  beforeEach(() => {
    gate = new PaceGate();
    audiusPaceGate.reset();
  });

  test('acquire allows first call immediately and paces subsequent call within minSpacingMs', async () => {
    let virtualTime = 1000;
    let sleptMs = 0;
    const nowFn = () => virtualTime;
    const sleepFn = async (ms: number) => {
      sleptMs += ms;
      virtualTime += ms;
    };

    await gate.acquire('api.test.org', 250, nowFn, sleepFn);
    assert.equal(sleptMs, 0);

    // Call again 50ms later -> must sleep 200ms
    virtualTime = 1050;
    await gate.acquire('api.test.org', 250, nowFn, sleepFn);
    assert.equal(sleptMs, 200);
  });

  test('triggerCooldown sets active cooldown and getCooldownRemaining reflects time', () => {
    gate.triggerCooldown('node1', 10000, 1000);
    assert.equal(gate.isCoolingDown('node1', 2000), true);
    assert.equal(gate.getCooldownRemaining('node1', 2000), 9000);

    // After cooldown expires
    assert.equal(gate.isCoolingDown('node1', 12000), false);
    assert.equal(gate.getCooldownRemaining('node1', 12000), 0);
  });

  test('acquire throws immediately when key is in active cooldown', async () => {
    gate.triggerCooldown('blocked.node', 30000, 1000);
    await assert.rejects(
      () => gate.acquire('blocked.node', 200, () => 2000),
      /Rate limit cooldown active for blocked\.node/
    );
  });

  test('Audius search skips cooling-down nodes and fails over without hammering', async () => {
    const contactedNodes: string[] = [];
    const mockFetch = async (url: RequestInfo | URL) => {
      const u = String(url);
      contactedNodes.push(u);
      if (u.startsWith(DISCOVERY_NODES[0])) {
        return { ok: false, status: 429 } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'tr-ok', title: 'Healthy Node Song', duration: 150 }],
        }),
      } as Response;
    };

    // First search: node 0 returns 429, triggers cooldown, node 1 succeeds
    const res1 = await searchAudius('ambient', 10, mockFetch as any);
    assert.equal(res1[0].title, 'Healthy Node Song');
    assert.equal(contactedNodes.length, 2);
    assert.equal(audiusPaceGate.isCoolingDown(DISCOVERY_NODES[0]), true);

    // Second search: node 0 is in cooldown and is skipped completely; starts directly at node 1!
    contactedNodes.length = 0;
    const res2 = await searchAudius('downtempo', 10, mockFetch as any);
    assert.equal(res2[0].title, 'Healthy Node Song');
    assert.equal(contactedNodes.length, 1);
    assert.ok(contactedNodes[0].startsWith(DISCOVERY_NODES[1]), 'Should skip node 0 and call node 1 directly');
  });
});
