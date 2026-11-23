import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLazyViewRegistry } from '../src/workspace/lazy-views';

test('createLazyViewRegistry registers views without building them eagerly', () => {
  const registry = createLazyViewRegistry();
  let buildCount = 0;

  registry.register('settings', () => {
    buildCount++;
  });

  assert.equal(registry.has('settings'), true);
  assert.equal(registry.has('audio'), false);
  assert.equal(registry.isBuilt('settings'), false);
  assert.equal(buildCount, 0, 'builder must not execute upon registration');
});

test('createLazyViewRegistry builds on first open and preserves DOM elements', () => {
  const registry = createLazyViewRegistry();
  const mockPanel = {
    children: [] as any[],
    append(...nodes: any[]) {
      this.children.push(...nodes);
    },
    hidden: true,
  } as any;

  let builderCalls = 0;
  registry.register('audio', (panel) => {
    builderCalls++;
    panel.append({ id: 'audio-studio-root' });
  });

  // First open
  const builtFirst = registry.build('audio', mockPanel);
  assert.equal(builtFirst, true);
  assert.equal(builderCalls, 1);
  assert.equal(registry.isBuilt('audio'), true);
  assert.equal(mockPanel.children.length, 1);
  assert.equal(mockPanel.children[0].id, 'audio-studio-root');

  // Second open (must NOT rebuild or duplicate)
  const builtSecond = registry.build('audio', mockPanel);
  assert.equal(builtSecond, false, 'subsequent build must return false');
  assert.equal(builderCalls, 1, 'builder must only be invoked once');
  assert.equal(mockPanel.children.length, 1, 'children must remain mounted without duplicates');
});

test('createLazyViewRegistry records build metrics with duration', () => {
  const registry = createLazyViewRegistry();
  const mockPanel = { append() {} } as any;

  registry.register('jarvis', () => {
    // Simulate minor work
    let x = 0;
    for (let i = 0; i < 10000; i++) x += i;
  });

  registry.build('jarvis', mockPanel);
  const metrics = registry.getBuildMetrics();
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].id, 'jarvis');
  assert.equal(typeof metrics[0].durationMs, 'number');
  assert.ok(metrics[0].durationMs >= 0);
  assert.ok(metrics[0].timestamp > 0);
});

test('createLazyViewRegistry returns false for unregistered views', () => {
  const registry = createLazyViewRegistry();
  const mockPanel = { append() {} } as any;

  assert.equal(registry.build('nonexistent', mockPanel), false);
  assert.equal(registry.isBuilt('nonexistent'), false);
});

test('lazy deferral reduces initial synchronous startup execution', () => {
  // Benchmark simulating 3 heavy views (Settings, Audio Studio, Kevo desk)
  const heavyViewSim = () => {
    const arr: string[] = [];
    for (let i = 0; i < 50000; i++) {
      arr.push(`element-${i}`);
    }
    return arr.length;
  };

  // Eager build scenario: all 3 heavy views run at startup
  const t0Eager = performance.now();
  heavyViewSim(); // Settings
  heavyViewSim(); // Audio Studio
  heavyViewSim(); // Kevo desk
  const eagerStartupTime = performance.now() - t0Eager;

  // Lazy build scenario: 0 heavy views run at startup
  const registry = createLazyViewRegistry();
  const mockPanel = { append() {} } as any;
  const t0Lazy = performance.now();
  registry.register('settings', () => { heavyViewSim(); });
  registry.register('audio', () => { heavyViewSim(); });
  registry.register('jarvis', () => { heavyViewSim(); });
  const lazyStartupTime = performance.now() - t0Lazy;

  assert.ok(lazyStartupTime < eagerStartupTime, `Lazy startup (${lazyStartupTime.toFixed(2)}ms) should be significantly faster than eager (${eagerStartupTime.toFixed(2)}ms)`);
  assert.equal(registry.isBuilt('settings'), false);
  assert.equal(registry.isBuilt('audio'), false);
  assert.equal(registry.isBuilt('jarvis'), false);

  // When opening settings for the first time
  const t0Open = performance.now();
  registry.build('settings', mockPanel);
  const openTime = performance.now() - t0Open;
  assert.equal(registry.isBuilt('settings'), true);
  assert.ok(openTime >= 0);
});

test('workspace views: lazy panels build on first open and stay mounted on view switch', () => {
  interface MockPanel {
    id: string;
    hidden: boolean;
    children: string[];
    append(node: string): void;
  }

  const panels = new Map<string, MockPanel>();
  const registry = createLazyViewRegistry();
  const buildCounts: Record<string, number> = { settings: 0, audio: 0, jarvis: 0 };

  function createPanel(id: string, eagerChild?: string): MockPanel {
    const p: MockPanel = {
      id,
      hidden: id !== 'chat',
      children: eagerChild ? [eagerChild] : [],
      append(node: string) {
        this.children.push(node);
      },
    };
    panels.set(id, p);
    return p;
  }

  // Eager views
  createPanel('home', 'dashboard-root');
  createPanel('chat', 'chat-conversation');
  createPanel('documents', 'documents-library');
  createPanel('writing', 'codemirror-editor');
  createPanel('music', 'music-hub-player');

  // Lazy views (Settings, Audio Studio, Kevo desk)
  const settingsPanel = createPanel('settings');
  const audioPanel = createPanel('audio');
  const jarvisPanel = createPanel('jarvis');

  registry.register('settings', (p: any) => {
    buildCounts.settings++;
    p.append('settings-hub-dom');
  });
  registry.register('audio', (p: any) => {
    buildCounts.audio++;
    p.append('audio-studio-dom');
  });
  registry.register('jarvis', (p: any) => {
    buildCounts.jarvis++;
    p.append('kevo-command-desk-dom');
  });

  function showView(id: string) {
    const p = panels.get(id);
    if (p && !registry.isBuilt(id) && registry.has(id)) {
      registry.build(id, p as any);
    }
    for (const [key, panel] of panels) {
      panel.hidden = key !== id;
    }
  }

  // Verify initial state: startup has 0 lazy views built
  assert.equal(buildCounts.settings, 0);
  assert.equal(buildCounts.audio, 0);
  assert.equal(buildCounts.jarvis, 0);
  assert.equal(settingsPanel.children.length, 0);
  assert.equal(audioPanel.children.length, 0);
  assert.equal(jarvisPanel.children.length, 0);

  // Eager views are immediately ready
  assert.deepEqual(panels.get('music')?.children, ['music-hub-player']);
  assert.deepEqual(panels.get('writing')?.children, ['codemirror-editor']);

  // Open Audio Studio
  showView('audio');
  assert.equal(buildCounts.audio, 1);
  assert.equal(audioPanel.hidden, false);
  assert.deepEqual(audioPanel.children, ['audio-studio-dom']);

  // Switch to Home (Audio Studio must remain mounted with hidden = true)
  showView('home');
  assert.equal(audioPanel.hidden, true);
  assert.deepEqual(audioPanel.children, ['audio-studio-dom'], 'Audio Studio state preserved while hidden');

  // Switch back to Audio Studio (must not rebuild)
  showView('audio');
  assert.equal(buildCounts.audio, 1, 'Audio Studio not rebuilt on subsequent open');
  assert.equal(audioPanel.hidden, false);

  // Open Settings
  showView('settings');
  assert.equal(buildCounts.settings, 1);
  assert.equal(settingsPanel.hidden, false);
  assert.deepEqual(settingsPanel.children, ['settings-hub-dom']);

  // Open Kevo desk
  showView('jarvis');
  assert.equal(buildCounts.jarvis, 1);
  assert.equal(jarvisPanel.hidden, false);
  assert.deepEqual(jarvisPanel.children, ['kevo-command-desk-dom']);

  // All 3 lazy views are now built and all panels stay mounted
  assert.equal(panels.size, 8);
  for (const [, panel] of panels) {
    assert.ok(panel.children.length > 0, `Panel ${panel.id} has preserved content`);
  }
});
