import './kevo-float.css';
import { createKevoFloat, type KevoStateEvent } from './float';

export * from './float';

const root = document.getElementById('kevo-float-root');
if (root) {
  const floatView = createKevoFloat(root);

  // Listen for the Tauri state event when running in Tauri
  try {
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<KevoStateEvent>('kevo://state', (e) => floatView.applyState(e.payload));
    }).catch(() => {});
  } catch {
    // Not running inside Tauri (e.g. test environments)
  }
}
