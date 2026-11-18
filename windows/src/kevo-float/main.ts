import './kevo-float.css';
import { createKevoFloat, type KevoStateEvent } from './float';
import { handlePillDrop } from './drop';
import { onDragDrop } from '../core/bridge';

export * from './float';
export * from './drop';

const root = document.getElementById('kevo-float-root');
if (root) {
  const floatView = createKevoFloat(root, {
    onResize: (expanded) => {
      try {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('kevo_float_resize', { expanded }).catch(() => {});
        }).catch(() => {});
      } catch {
        // Not running inside Tauri
      }
    },
  });

  // Wire file drop through the HTML5 onDragDrop bridge
  void onDragDrop((payload) => {
    void handlePillDrop(payload, {
      showMessage: (msg) => floatView.showMessage(msg),
    });
  });

  // Listen for the Tauri state event when running in Tauri
  try {
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<KevoStateEvent>('kevo://state', (e) => floatView.applyState(e.payload));
    }).catch(() => {});
  } catch {
    // Not running inside Tauri (e.g. test environments)
  }
}
