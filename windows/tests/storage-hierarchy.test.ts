import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  StorageTier,
  STORAGE_POLICIES,
  OfflineMutationQueue,
} from '../../shared/domain/storage-hierarchy.js';

describe('Offline-First 4-Tier Storage Hierarchy & Mutation Queue', () => {
  it('STORAGE_POLICIES enforces 4 tiers with distinct encryption and quotas', () => {
    assert.ok(STORAGE_POLICIES[StorageTier.Vault]);
    assert.ok(STORAGE_POLICIES[StorageTier.IndexedDb]);
    assert.ok(STORAGE_POLICIES[StorageTier.Filesystem]);
    assert.ok(STORAGE_POLICIES[StorageTier.Session]);

    // Vault is encrypted at rest
    assert.equal(STORAGE_POLICIES[StorageTier.Vault].encrypted, true);
    assert.equal(STORAGE_POLICIES[StorageTier.Vault].persistence, 'permanent');

    // Session is ephemeral
    assert.equal(STORAGE_POLICIES[StorageTier.Session].persistence, 'ephemeral');
  });

  it('OfflineMutationQueue enqueues mutations and deduplicates IDs idempotently', () => {
    const queue = new OfflineMutationQueue();
    assert.equal(queue.size(), 0);

    const first = queue.enqueue({
      id: 'mut-101',
      op: 'note_create',
      payload: { title: 'Offline Note' },
      tier: StorageTier.Vault,
    });
    assert.equal(first, true);
    assert.equal(queue.size(), 1);

    // Duplicate enqueue returns false
    const duplicate = queue.enqueue({
      id: 'mut-101',
      op: 'note_create',
      payload: { title: 'Offline Note' },
      tier: StorageTier.Vault,
    });
    assert.equal(duplicate, false);
    assert.equal(queue.size(), 1);

    // Distinct enqueue succeeds
    const second = queue.enqueue({
      id: 'mut-102',
      op: 'audio_cache',
      payload: { trackId: 't1' },
      tier: StorageTier.IndexedDb,
    });
    assert.equal(second, true);
    assert.equal(queue.size(), 2);
  });

  it('OfflineMutationQueue peek, dequeue, and clear manage items safely', () => {
    const queue = new OfflineMutationQueue();
    queue.enqueue({ id: 'm1', op: 'op1', payload: null, tier: StorageTier.Session });
    queue.enqueue({ id: 'm2', op: 'op2', payload: null, tier: StorageTier.Session });

    assert.equal(queue.peek()?.id, 'm1');
    assert.equal(queue.size(), 2);

    assert.equal(queue.dequeue('m1'), true);
    assert.equal(queue.size(), 1);
    assert.equal(queue.peek()?.id, 'm2');

    queue.clear();
    assert.equal(queue.size(), 0);
  });

  it('OfflineMutationQueue replay executes handler and retains failing mutations', async () => {
    const queue = new OfflineMutationQueue();
    queue.enqueue({ id: 'succeed-1', op: 'sync', payload: {}, tier: StorageTier.Vault });
    queue.enqueue({ id: 'fail-1', op: 'sync', payload: {}, tier: StorageTier.Vault });
    queue.enqueue({ id: 'succeed-2', op: 'sync', payload: {}, tier: StorageTier.Vault });

    const result = await queue.replay(async mut => {
      if (mut.id === 'fail-1') {
        return false;
      }
      return true;
    });

    assert.equal(result.processed, 2);
    assert.equal(result.failed, 1);
    assert.equal(queue.size(), 1);
    assert.equal(queue.peek()?.id, 'fail-1');
    assert.equal(queue.peek()?.attempts, 1);
  });
});
