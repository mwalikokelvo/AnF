# Handoff Report: Milestone M1 (Area 1) — Audio Player Engine & Controls Integration

## 1. Observation

Direct investigation of the AnF codebase across Windows desktop, shared domain logic, Tauri Rust backend, and Android native host revealed the following specific findings:

### 1.1 Existing Audio Player Controls in `windows/src/workspace/music-hub.ts`
- **Play/Pause Toggle** (`lines 43, 66-67`):
  `toggle=button('Play',async()=>{if(!current)return;if(audio.paused)await resume();else pause();},'play')`
  `resume()` awaits `options.beforePlay()`, updates `metadata()`, and calls `await audio.play()`. If `audio.play()` rejects (e.g. autoplay restriction, decoder abort), the rejection is uncaught and leaves playback in an inconsistent state.
- **Missing `stop()` Control** (`lines 67, 131`):
  `music-hub.ts` implements only `pause()` and `suspend()`. There is no `stop()` function to reset playback position to `0`, clear buffering/loading pipelines, update MediaSession, and set playback status to idle. Furthermore, `createMusicHub`'s exported interface only exposes `{root, pause, suspend, refresh, ready}`.
- **Seeking Behavior & Audio Pops** (`line 123`):
  `seek.addEventListener('input',()=>{audio.currentTime=Number(seek.value);paint();});`
  Assigning `audio.currentTime` on every `input` event during scrub fires dozens of decoder flushes and audio seeks per second, causing audible stuttering/clicks. Furthermore, if `audio.readyState === 0` (HAVE_NOTHING), setting `currentTime` throws `InvalidStateError` in certain browser engines.
- **Previous Track Inconsistency** (`lines 69`):
  `if(direction<0&&audio.currentTime>3){audio.currentTime=0;return;}`
  When resetting `currentTime = 0`, neither `paint()` nor `save()` is invoked; the UI stays showing the old timestamp until the next periodic `timeupdate` tick.
  Additionally, for `direction < 0`:
  `id=direction>0?nextTrack(queue,current.id,prefs.repeat,automatic):queue[index]||(prefs.repeat==='all'?queue.at(-1):undefined)`
  When `current` is at index 0 (`index = -1`), `queue[-1]` is `undefined`. If `prefs.repeat === 'track'`, it returns `undefined` and stops instead of restarting or repeating.
- **Playback Rate / Speed Reset Bug** (`lines 23, 45, 68, 125`):
  - On initialization (`line 23`): `audio.volume=prefs.volume;` is called, but `audio.playbackRate=prefs.speed;` is NEVER set.
  - On track switch (`line 68`): `audio.src=source; ... audio.load();` is executed. HTML5 `<audio>` specifications specify that reloading the media source resets `playbackRate` to `1.0`. Neither `select()` nor `loadedmetadata` re-applies `prefs.speed`. Consequently, playback silently drops back to 1.0x speed while the UI dropdown continues showing 1.25x or 1.5x.
- **Sleep Timer Edge Cases** (`lines 46-48`):
  `sleepTimer=setTimeout(()=>{pause();report('Sleep timer ended playback.');},minutes*60*1000);`
  - When the timeout fires, `sleep.value` remains set to `'15'`, `'30'`, etc., rather than resetting to `'0'` ('Off').
  - When `suspend()` or `stop()` is called, `sleepTimer` is not cleared and can fire minutes later in the background.
  - Lacks an "End of track" option which is standard in MKR Music and AntennaPod.
- **Volume & Mute**:
  `volume.addEventListener('input',()=>{audio.volume=prefs.volume=Number(volume.value);save();});`
  There is no mute toggle button or volume mute memory.

### 1.2 Audio Playback State Machine in `music-hub.ts`
- Currently, `music-hub.ts` has **no explicit playback state machine enum or tracker**. It relies solely on `audio.paused` boolean in `paint()`.
- **Missing Event Listeners**:
  - `audio.addEventListener('error', ...)` is **completely absent** in `music-hub.ts`! (In contrast, `audio-studio.ts:148` listens to `error`). When decoding fails, a file is corrupted, or a blob URL is revoked, the player hangs silently without user notice, and queue auto-advance deadlocks.
  - `loadstart`, `waiting`, `canplay`, `canplaythrough`, `playing`, `stalled` are not tracked, meaning buffering states cannot be presented to the user.
- **MediaSession Playback State**:
  `navigator.mediaSession.playbackState` is NEVER set in `music-hub.ts` (`lines 64-65`), so the OS media overlay and hardware keys cannot tell whether AnF is playing or paused.

### 1.3 Audio Queue Reconciliation in `shared/audio/queue.ts`
- Current content of `shared/audio/queue.ts` (`lines 1-11`):
  ```typescript
  export type RepeatMode='off'|'track'|'all';
  export function reconcileQueue(saved:string[],available:string[],includeNew=true):string[]{
   const valid=new Set(available),seen=new Set<string>();return (includeNew?[...saved,...available]:saved).filter(id=>valid.has(id)&&!seen.has(id)&&!!seen.add(id));
  }
  export function moveTrack(ids:string[],id:string,target:number):string[]{const next=ids.filter(x=>x!==id);if(!ids.includes(id))return [...ids];next.splice(Math.max(0,Math.min(next.length,target)),0,id);return next;}
  export function shuffled(ids:string[],random:()=>number=Math.random):string[]{const next=[...ids];for(let i=next.length-1;i>0;i--){const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));[next[i],next[j]]=[next[j],next[i]];}return next;}
  export function nextTrack(ids:string[],current:string|undefined,repeat:RepeatMode,automatic:boolean):string|undefined{
   if(!ids.length)return;if(automatic&&repeat==='track'&&current&&ids.includes(current))return current;
   const i=current?ids.indexOf(current):-1;return ids[i+1]||(repeat==='all'?ids[0]:undefined);
  }
  ```
- **Missing `previousTrack()`**: Not present in `queue.ts`. As a result, `music-hub.ts:69` and `audio-studio.ts:85` each have differing ad-hoc implementations (`audio-studio` falls back to `state.order[0]`, whereas `music-hub` falls back to `undefined`).
- **Unused `moveTrack`**: `music-hub.ts:85` uses raw `.splice()` instead of `moveTrack()`, and fails to update `prefs.originalQueue` when moving tracks.
- **Queue refresh gap**: `music-hub.ts:116` `refresh()` updates `tracks` and `playlists`, but does NOT reconcile `queue` against updated library tracks.

### 1.4 Mutual Exclusivity with Audio Studio & Native Audio
- In `windows/src/workspace/main.ts` (`lines 214-218`):
  - `musicHub.beforePlay()` calls: `audioStudio.stop(); audioStudio.hideDock(); await nativeMusic?.suspend(); await invoke('music_pause');`
  - `audioStudio.beforePlay()` calls: `musicHub.suspend(); await nativeMusic?.suspend(); await invoke('music_pause');`
- **MediaSession Leak on Suspend**:
  When `musicHub.suspend()` is called (`music-hub.ts:131`), it does NOT clear `navigator.mediaSession.metadata` or set `playbackState = 'none'`. This allows MediaSession hardware keys to accidentally reactivate `musicHub` while `audioStudio` is open.
- **Android MediaBridge Discrepancy**:
  In `music-hub.ts:88`:
  `native.mediaRequest!(id,'play',JSON.stringify({url:track.id,title:track.title,artist:track.artist||'',album:track.album||'',art:''}));`
  In `android/java/com/coucou/workspace/MediaBridge.java:89`:
  Remote URLs must be dispatched with operation `'play_remote'`. Operation `'play'` takes no URL and simply calls `player.play()`.

---

## 2. Logic Chain

1. **State Machine Integrity**:
   Because `music-hub.ts` lacks explicit playback states (`idle`, `buffering`, `ready`, `playing`, `paused`, `ended`, `error`), errors and network stalls leave the audio player in an indeterminate visual and logical state. By introducing `type PlaybackState` and wiring `loadstart`, `waiting`, `canplay`, `playing`, `pause`, `ended`, and `error`, every state transition is deterministic and recoverable.
2. **Playback Rate Consistency**:
   Because the HTML5 audio element resets its internal playback rate upon `audio.load()`, any change of track or reload reverts playback rate to 1.0x. Adding an `applySpeed()` call inside `loadedmetadata` and `select()` ensures that user preferences (e.g. 1.25x or 1.5x) persist seamlessly across track switches.
3. **Queue Reconciliation & Symmetrical Navigation**:
   Extracting `previousTrack(ids, current, repeat)` into `shared/audio/queue.ts` establishes single-source-of-truth semantics for queue navigation. Both `music-hub.ts` and `audio-studio.ts` can use the exact same algorithm, correctly handling `repeat: 'all'` (wrap to end), `repeat: 'track'` (stay on current), and `repeat: 'off'` (stop or seek to 0).
4. **MediaSession Hygiene & Audio Studio Exclusivity**:
   Ensuring `musicHub.suspend()` and `musicHub.stop()` clear `navigator.mediaSession.metadata = null` and set `navigator.mediaSession.playbackState = 'none'` prevents zombie media events from colliding with `Audio Studio`.
5. **Test Harness Extensibility**:
   `windows/scripts/test.mjs` currently bundles only `lyrics-provider.test.ts`. Updating `test.mjs` to bundle all `tests/*.test.ts` files allows adding unit test suites for the audio player engine and queue algorithms that run in CI via `npm test`.

---

## 3. Caveats

1. **Audio File Decoding Limits**: Waveform rendering and AudioContext decoding in `audio-studio.ts` are limited to files under 16 MB and 5 minutes. HTML5 Audio in `music-hub.ts` does not have this limit and can stream/play full-length tracks and audiobooks via blob URLs or remote URLs.
2. **Android Media3 Background Service**: On Android, background lock-screen audio playback is delegated to `PlaybackService.java` via `MediaBridge.java`. The fix for the `'play_remote'` operation identifier ensures remote podcast episodes stream properly on Android.
3. **Hardware Media Keys**: Some external Bluetooth headphones or keyboards throttle MediaSession action callbacks. Using debounced handlers ensures repeated presses do not corrupt the queue index.

---

## 4. Conclusion & Implementation Specifications

To complete Milestone M1 (Area 1), the Worker agent should implement the following concrete code modifications across 4 files:

### File 1: `shared/audio/queue.ts`
Add `previousTrack` and queue manipulation functions to `shared/audio/queue.ts`:

```typescript
export type RepeatMode = 'off' | 'track' | 'all';

export function reconcileQueue(saved: string[], available: string[], includeNew = true): string[] {
  const valid = new Set(available), seen = new Set<string>();
  return (includeNew ? [...saved, ...available] : saved).filter(id => valid.has(id) && !seen.has(id) && !!seen.add(id));
}

export function moveTrack(ids: string[], id: string, target: number): string[] {
  const next = ids.filter(x => x !== id);
  if (!ids.includes(id)) return [...ids];
  next.splice(Math.max(0, Math.min(next.length, target)), 0, id);
  return next;
}

export function shuffled(ids: string[], random: () => number = Math.random): string[] {
  const next = [...ids];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function nextTrack(ids: string[], current: string | undefined, repeat: RepeatMode, automatic: boolean): string | undefined {
  if (!ids.length) return undefined;
  if (automatic && repeat === 'track' && current && ids.includes(current)) return current;
  const i = current ? ids.indexOf(current) : -1;
  return ids[i + 1] || (repeat === 'all' ? ids[0] : undefined);
}

export function previousTrack(ids: string[], current: string | undefined, repeat: RepeatMode): string | undefined {
  if (!ids.length) return undefined;
  const i = current ? ids.indexOf(current) : -1;
  if (i > 0) return ids[i - 1];
  if (i === 0) return repeat === 'all' ? ids[ids.length - 1] : (repeat === 'track' ? current : undefined);
  return ids[0];
}

export function enqueueTrack(ids: string[], id: string): string[] {
  return ids.includes(id) ? [...ids] : [...ids, id];
}

export function playNextTrack(ids: string[], current: string | undefined, id: string): string[] {
  const filtered = ids.filter(x => x !== id);
  if (!current) return [id, ...filtered];
  const idx = filtered.indexOf(current);
  if (idx === -1) return [...filtered, id];
  filtered.splice(idx + 1, 0, id);
  return filtered;
}

export function playPreviousTrack(ids: string[], current: string | undefined, id: string): string[] {
  const filtered = ids.filter(x => x !== id);
  if (!current) return [id, ...filtered];
  const idx = filtered.indexOf(current);
  if (idx === -1) return [id, ...filtered];
  filtered.splice(idx, 0, id);
  return filtered;
}

export function removeTrack(ids: string[], id: string): string[] {
  return ids.filter(x => x !== id);
}
```

### File 2: `windows/src/workspace/music-hub.ts`
Key enhancements in `music-hub.ts`:
1. **Import `previousTrack`, `enqueueTrack`, `playNextTrack`, `playPreviousTrack`, `removeTrack`** from `./audio-queue`.
2. **Define `PlaybackState`**:
   ```typescript
   export type PlaybackState = 'idle' | 'buffering' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';
   ```
3. **State and Playback Rate Management**:
   ```typescript
   let playbackState: PlaybackState = 'idle';
   let playbackError: string | null = null;
   function setPlaybackState(state: PlaybackState, error: string | null = null) {
     playbackState = state;
     playbackError = error;
     paint();
   }
   function applySpeed() {
     audio.playbackRate = prefs.speed;
   }
   ```
4. **Implement `stop()`**:
   ```typescript
   function stop() {
     audio.pause();
     audio.currentTime = 0;
     pending = 0;
     setPlaybackState('idle');
     if ('mediaSession' in navigator) {
       navigator.mediaSession.playbackState = 'none';
     }
     save();
     paint();
   }
   ```
5. **Attach complete audio event listeners**:
   ```typescript
   audio.addEventListener('loadstart', () => setPlaybackState('buffering'));
   audio.addEventListener('waiting', () => setPlaybackState('buffering'));
   audio.addEventListener('canplay', () => setPlaybackState(audio.paused ? 'ready' : 'playing'));
   audio.addEventListener('playing', () => {
     setPlaybackState('playing');
     if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
   });
   audio.addEventListener('pause', () => {
     if (playbackState !== 'ended' && playbackState !== 'error') setPlaybackState('paused');
     if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
   });
   audio.addEventListener('ended', () => {
     setPlaybackState('ended');
     if (sleep.value === 'end') {
       armSleep(0);
       sleep.value = '0';
       report('Sleep timer ended playback at end of track.');
       pause();
       return;
     }
     void step(1, true);
   });
   audio.addEventListener('error', () => {
     const err = audio.error;
     let msg = 'Playback error.';
     if (err) {
       if (err.code === MediaError.MEDIA_ERR_DECODE) msg = 'Audio decoding failed. The file may be corrupt.';
       else if (err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) msg = 'Audio format not supported on this device.';
       else if (err.code === MediaError.MEDIA_ERR_NETWORK) msg = 'Network error loading audio stream.';
     }
     setPlaybackState('error', msg);
     report(msg);
   });
   audio.addEventListener('loadedmetadata', () => {
     applySpeed();
     if (pending > 0) {
       audio.currentTime = Math.min(pending, duration());
       pending = 0;
     }
     paint();
   });
   ```
6. **Sleep Timer**:
   Support `[['0','Off'],['15','15 min'],['30','30 min'],['45','45 min'],['60','60 min'],['end','End of track']]`.
   Clear timer and reset selector on suspend or completion.
7. **`step()` with `previousTrack`**:
   ```typescript
   async function step(direction: number, automatic = false) {
     if (!current) return;
     if (direction < 0 && audio.currentTime > 3) {
       audio.currentTime = 0;
       paint();
       save();
       return;
     }
     const id = direction > 0
       ? nextTrack(queue, current.id, prefs.repeat, automatic)
       : previousTrack(queue, current.id, prefs.repeat);
     const track = tracks.find(t => t.id === id);
     if (track) {
       if (track.id === current.id && prefs.repeat === 'track') {
         audio.currentTime = 0;
         await resume();
       } else {
         await select(track);
       }
     } else {
       if (direction > 0 && automatic) {
         setPlaybackState('ended');
         audio.currentTime = 0;
       }
       pause();
     }
   }
   ```
8. **Lock-Screen Remote Podcast Call**:
   In `playOnLockScreen()`: replace `'play'` with `'play_remote'`:
   `native.mediaRequest!(id,'play_remote',JSON.stringify({url:track.id,title:track.title,artist:track.artist||'',album:track.album||'',art:''}));`
9. **Suspend MediaSession Cleanup**:
   ```typescript
   suspend: () => {
     pause();
     if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = undefined; sleep.value = '0'; }
     suspended = true;
     if (fullPlayer.open) fullPlayer.close();
     dock.hidden = true;
     document.body.classList.remove('has-music-player');
     if ('mediaSession' in navigator) {
       navigator.mediaSession.metadata = null;
       navigator.mediaSession.playbackState = 'none';
     }
   }
   ```
10. **Reconcile Queue on `refresh()`**:
    Inside `refresh()`:
    ```typescript
    tracks = await library.tracks();
    playlists = await library.playlists();
    const trackIds = tracks.map(t => t.id);
    queue = reconcileQueue(queue, trackIds, false);
    prefs.originalQueue = reconcileQueue(prefs.originalQueue, trackIds, false);
    render();
    ```
11. **Return Interface of `createMusicHub`**:
    Expose `{ root, play: resume, pause, stop, suspend, refresh, ready, getState: () => playbackState, getError: () => playbackError, step }`.

### File 3: `windows/src/workspace/audio-studio.ts`
- Import `previousTrack` from `./audio-queue`.
- Update `previous()` to:
  ```typescript
  async function previous() {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const id = previousTrack(state.order, track?.id, state.repeat);
    const t = all.find(t => t.id === id);
    if (t) {
      await open(t);
      await resume();
    }
  }
  ```

### File 4: `windows/scripts/test.mjs` & `windows/tests/audio-player-engine.test.ts`
- In `windows/scripts/test.mjs`:
  Dynamically bundle all test files in `tests/`:
  ```javascript
  import { readdir } from 'node:fs/promises';
  ...
  const testFiles = (await readdir(path.join(root, 'tests'))).filter(f => f.endsWith('.test.ts')).map(f => path.join(root, 'tests', f));
  await build({
    entryPoints: testFiles,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    outfile,
  });
  ```
- Create `windows/tests/audio-player-engine.test.ts` testing:
  1. `reconcileQueue`: subset retention, deduplication, valid ID filtering.
  2. `nextTrack`: `repeat: 'off'` (boundary ends at undefined), `repeat: 'track'` (automatic loops current, manual skips next), `repeat: 'all'` (wraps around).
  3. `previousTrack`: index > 0 returns preceding; index 0 with `repeat: 'all'` returns last track; index 0 with `repeat: 'off'` returns undefined; index 0 with `repeat: 'track'` returns current.
  4. `moveTrack`, `shuffled`, `enqueueTrack`, `playNextTrack`, `playPreviousTrack`, `removeTrack`.

---

## 5. Verification Method

### Automated Unit Test Verification
1. Run the test suite:
   ```powershell
   cd C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows
   npm test
   ```
   **Expected Result**: All tests in `tests/lyrics-provider.test.ts` and `tests/audio-player-engine.test.ts` execute and pass with 0 exit code.

2. Run TypeScript compilation verification:
   ```powershell
   cd C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows
   node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit
   ```
   **Expected Result**: TypeScript type-checking completes cleanly with 0 errors.

### Manual / Integration Verification Checklist
1. **Playback Rate Persistence**: Choose 1.5x in the speed selector. Skip to the next track. Inspect `audio.playbackRate` — verify it remains at 1.5x.
2. **Error Recovery**: Attempt to select an unplayable audio blob. Verify that `error` event triggers, status shows user-friendly error message, transport buttons do not freeze, and skipping to next valid track recovers playback.
3. **Mutual Exclusivity**: Play a track in Music Hub, then switch to Audio Studio and press Play. Verify that Music Hub suspends, its dock hides, and MediaSession metadata is transferred cleanly without duplicate play events.
4. **Sleep Timer**: Select "15 min" and verify timer is armed. Set to "Off" and verify timer clears. Set to "End of track" and verify playback pauses when track ends.
