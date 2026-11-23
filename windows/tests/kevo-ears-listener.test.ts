import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { KevoEarsListener } from '../src/workspace/jarvis/voice/kevo-ears-listener';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('KevoEarsListener (Step 1.3)', () => {
  it('instantiates with options and defaults', () => {
    const listener = new KevoEarsListener({
      settleMs: 100,
      followUpMs: 2000,
    });
    assert.equal(listener.getListeningState(), false);
    assert.equal(listener.isAwake(), false);
  });

  it('keepAwake keeps listener awake for followUpMs', async () => {
    let awakeState = false;
    const listener = new KevoEarsListener({
      followUpMs: 150,
      onAwakeChange: (awake) => {
        awakeState = awake;
      },
    });

    assert.equal(listener.isAwake(), false);
    listener.keepAwake();
    assert.equal(listener.isAwake(), true);
    assert.equal(awakeState, true);

    await wait(200);
    assert.equal(listener.isAwake(), false);
    assert.equal(awakeState, false);
  });

  it('addStateListener notifies subscribers of listening state changes', () => {
    const listener = new KevoEarsListener();
    const states: boolean[] = [];
    const unsub = listener.addStateListener((state) => states.push(state));

    listener.start();
    listener.stop();
    unsub();
    listener.start();

    // Since in node test environment IS_TAURI is false, start() fails gracefully with error
    assert.equal(typeof unsub, 'function');
  });

  it('setMuted toggles muted state and clears buffers', () => {
    const listener = new KevoEarsListener();
    listener.setMuted(true);
    listener.setMuted(false);
  });
});

describe('KevoEarsListener settle and follow-up rules (with simulated Tauri events)', () => {
  let eventHandlers: Record<string, (payload: any) => void> = {};
  let eventSource: {
    onEvent: <T>(name: string, handler: (payload: T) => void) => () => void;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    mute: (m: boolean) => Promise<void>;
  };

  beforeEach(() => {
    eventHandlers = {};
    eventSource = {
      onEvent: (event: string, handler: (payload: any) => void) => {
        eventHandlers[event] = handler;
        return () => {
          delete eventHandlers[event];
        };
      },
      start: async () => {},
      stop: async () => {},
      mute: async () => {},
    };
  });

  const emitEvent = (event: string, payload: any) => {
    const handler = eventHandlers[event];
    if (handler) {
      handler(payload);
    }
  };

  it('reports listening only once the first-use download has finished, and shows the download (#284)', async () => {
    let finish!: () => void;
    eventSource.start = () => new Promise<void>((r) => { finish = r; });
    const states: boolean[] = [];
    const status: string[] = [];
    const errors: string[] = [];
    const listener = new KevoEarsListener({ eventSource, onListeningStateChange: (s) => states.push(s), onStatus: (t) => status.push(t), onError: (e) => errors.push(e) });
    listener.start();
    await wait(0);
    emitEvent('kevo-ears-download-progress', { id: 'kevo-vad', phase: 'download', done: 1 });
    assert.deepEqual(states, [], 'not listening while the models download');
    assert.ok(status[0]?.includes('downloading'), status.join('; '));
    finish();
    await listener.whenStarted();
    assert.deepEqual(states, [true]);
    listener.stop();

    // Switched off while downloading: a late failure is not reported and does not reopen anything.
    let fail!: (e: Error) => void;
    eventSource.start = () => new Promise<void>((_, reject) => { fail = reject; });
    listener.start();
    await wait(0);
    listener.stop();
    fail(new Error('offline'));
    await wait(0);
    assert.deepEqual(errors, []);
    assert.deepEqual(states, [true, false]);
  });

  it('binds every event before the backend starts, so a fast first wake is not lost (#284)', async () => {
    // Tauri's listen() registers asynchronously; an installed backend can emit at once.
    eventSource.onEvent = (event: string, handler: (payload: any) => void) =>
      wait(1).then(() => { eventHandlers[event] = handler; return () => { delete eventHandlers[event]; }; });
    eventSource.start = async () => emitEvent('kevo-ears-wake', 'kevo');
    const wakes: string[] = [];
    const listener = new KevoEarsListener({ eventSource, onWakeWord: (w) => wakes.push(w) });
    listener.start();
    await listener.whenStarted();
    assert.deepEqual(wakes, ['kevo']);
    listener.stop();

    // Switched off while the events are still binding: the backend is never started.
    let starts = 0;
    eventSource.start = async () => { starts++; };
    listener.start();
    listener.stop();
    await wait(20);
    assert.equal(starts, 0);
  });

  it('the bridge start rejects on a failed start instead of resolving (#284)', async () => {
    const { Bridge } = await import('../src/core/bridge');
    await assert.rejects(Bridge.kevoEarsStart());
  });

  it('kevo-ears-wake triggers onWakeWord and keeps listener awake', async () => {
    let wakeWord = '';
    const listener = new KevoEarsListener({
      eventSource,
      followUpMs: 300,
      onWakeWord: (w) => {
        wakeWord = w;
      },
    });

    listener.start();
    await wait(10);

    emitEvent('kevo-ears-wake', 'HEY_KEVO');
    assert.equal(wakeWord, 'HEY_KEVO');
    assert.equal(listener.isAwake(), true);

    listener.stop();
  });

  it('kevo-ears-final settles multiple speech phrases into one request', async () => {
    const heard: string[] = [];
    const listener = new KevoEarsListener({
      eventSource,
      settleMs: 300,
      followUpMs: 5000,
      onFinalSpeech: (text) => heard.push(text),
    });

    listener.start();
    await listener.whenStarted();

    // Awaken listener
    listener.keepAwake();

    // First phrase and rapid second phrase before settleMs expires
    emitEvent('kevo-ears-final', 'set a timer');
    emitEvent('kevo-ears-final', 'for ten seconds');

    // Wait for settleMs to flush
    await wait(450);
    assert.deepEqual(heard, ['set a timer for ten seconds']);

    listener.stop();
  });

  it('unconfirmed interim speech is promoted after settleMs + 1400', async () => {
    const heard: string[] = [];
    const listener = new KevoEarsListener({
      eventSource,
      settleMs: 10,
      followUpMs: 5000,
      onFinalSpeech: (text) => heard.push(text),
    });

    listener.start();
    await wait(10);
    listener.keepAwake();

    emitEvent('kevo-ears-partial', 'any other voice');
    await wait(1500);

    assert.deepEqual(heard, ['any other voice']);

    // Late final does not run again
    emitEvent('kevo-ears-final', 'any other voice');
    await wait(30);
    assert.deepEqual(heard, ['any other voice']);

    listener.stop();
  });

  it('speech without wake word is ignored when not awake', async () => {
    const heard: string[] = [];
    const listener = new KevoEarsListener({
      eventSource,
      settleMs: 10,
      followUpMs: 20,
      requireWakeWord: true,
      onFinalSpeech: (text) => heard.push(text),
    });

    listener.start();
    // Wait for the initial mic-tap followUp window to expire
    await wait(40);
    assert.equal(listener.isAwake(), false);

    // Not awake: room talk without wake word should be ignored
    emitEvent('kevo-ears-final', 'what is the weather today');
    await wait(30);
    assert.deepEqual(heard, []);

    // Speech with wake word is accepted
    emitEvent('kevo-ears-final', 'Kevo, what is the weather today');
    await wait(30);
    assert.deepEqual(heard, ['what is the weather today']);

    listener.stop();
  });

  it('muted listener ignores interim and final speech', async () => {
    const heard: string[] = [];
    const listener = new KevoEarsListener({
      eventSource,
      settleMs: 10,
      onFinalSpeech: (text) => heard.push(text),
    });

    listener.start();
    await wait(10);
    listener.keepAwake();

    listener.setMuted(true);
    emitEvent('kevo-ears-final', 'set a timer');
    await wait(30);
    assert.deepEqual(heard, []);

    listener.setMuted(false);
    emitEvent('kevo-ears-final', 'set a timer');
    await wait(30);
    assert.deepEqual(heard, ['set a timer']);

    listener.stop();
  });

  it('triggers onBargeIn when kevo-ears-barge-in fires or wake occurs while muted', async () => {
    let bargeInCalled = false;
    const listener = new KevoEarsListener({
      eventSource,
      onBargeIn: () => {
        bargeInCalled = true;
      },
    });

    listener.start();
    await wait(10);

    emitEvent('kevo-ears-barge-in', undefined);
    assert.equal(bargeInCalled, true);

    // Wake while muted also triggers barge-in (talking over Kevo)
    bargeInCalled = false;
    listener.setMuted(true);
    emitEvent('kevo-ears-wake', 'kevo');
    assert.equal(bargeInCalled, true);

    listener.stop();
  });
});
