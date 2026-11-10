import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/workspace/apps-catalog.js';

test('Open-source Companion Apps Catalog', async (t) => {
  await t.test('catalog contains verified companion apps', () => {
    assert.ok(CATALOG.length >= 25, `Expected at least 25 apps, got ${CATALOG.length}`);
  });

  await t.test('all app entries have unique IDs and required fields', () => {
    const ids = new Set<string>();
    const allowedCategories = new Set([
      'Reading',
      'Listening',
      'Notes and study',
      'Privacy and sync',
      'Local AI',
    ]);
    const allowedPlatforms = new Set(['Windows', 'Android', 'macOS', 'Linux']);

    for (const app of CATALOG) {
      assert.ok(app.id, 'App must have an ID');
      assert.ok(!ids.has(app.id), `Duplicate app ID found: ${app.id}`);
      ids.add(app.id);

      assert.ok(app.name && app.name.trim().length > 0, `App ${app.id} must have a name`);
      assert.ok(app.author && app.author.trim().length > 0, `App ${app.id} must have an author`);
      assert.ok(
        /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(app.repo),
        `App ${app.id} repo must be 'owner/repo', got ${app.repo}`
      );
      assert.ok(
        allowedCategories.has(app.category),
        `App ${app.id} category ${app.category} must be valid`
      );
      assert.ok(app.platforms.length > 0, `App ${app.id} must support at least one platform`);
      for (const p of app.platforms) {
        assert.ok(allowedPlatforms.has(p), `App ${app.id} platform ${p} must be valid`);
      }
      assert.ok(app.description.length > 10, `App ${app.id} must have a descriptive summary`);
    }
  });

  await t.test('includes verified community listening and reading apps', () => {
    const ids = new Set(CATALOG.map(a => a.id));
    assert.ok(ids.has('spotube'), 'Must include Spotube');
    assert.ok(ids.has('newpipe'), 'Must include NewPipe');
    assert.ok(ids.has('echo-music'), 'Must include Echo Music');
    assert.ok(ids.has('orion-store'), 'Must include Orion Store');
    assert.ok(ids.has('innertune'), 'Must include InnerTune');
    assert.ok(ids.has('rimusic'), 'Must include RiMusic');
    assert.ok(ids.has('koreader'), 'Must include KOReader');
    assert.ok(ids.has('kiwix-desktop'), 'Must include Kiwix');
  });
});
