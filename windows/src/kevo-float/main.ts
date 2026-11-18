// The float window's page. Rust shows, hides and places the window; this only draws what it is told.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { showState, type KevoHudEvent } from './float';
import './kevo-float.css';

const pill = document.getElementById('kevo-float')!;
void (async () => {
  await listen<KevoHudEvent>('kevo://state', (event) => showState(pill, event.payload));
  // The window may open after the last event: start from what Rust shows now.
  showState(pill, await invoke<KevoHudEvent>('kevo_hud_now'));
})();
