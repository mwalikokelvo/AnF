/**
 * File drop handling for Kevo float pill (H.5).
 * Uses the HTML5 drop bridge `onDragDrop` in `windows/src/core/bridge.ts`.
 * - Markdown and text files go into the vault.
 * - EPUB and audio files go to their respective import / transcription commands.
 * - Unsupported types get "I can't take that file yet" on the pill (no ingest).
 * - Oversize files (> 200 MB) are refused (no ingest).
 * - Files are copied, never moved.
 */
import type { DragDropPayload, DroppedFile } from '../core/bridge';

export const MAX_DROP_BYTES = 200 * 1024 * 1024; // 200 MB

export type FileCategory = 'markdown_text' | 'epub' | 'audio' | 'unsupported';

export function categorizeFile(name: string): FileCategory {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['md', 'markdown', 'txt'].includes(ext)) {
    return 'markdown_text';
  }
  if (ext === 'epub') {
    return 'epub';
  }
  if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'webm'].includes(ext)) {
    return 'audio';
  }
  return 'unsupported';
}

export interface PillDropFile {
  name: string;
  size?: number;
  ingest: () => Promise<DroppedFile>;
}

export interface FileDropHandlerOptions {
  showMessage: (msg: string) => void;
  importVault?: (file: DroppedFile) => Promise<unknown>;
  importEpub?: (file: DroppedFile) => Promise<unknown>;
  importAudio?: (file: DroppedFile) => Promise<unknown>;
  maxSize?: number;
}

export async function handlePillDrop(
  payload: DragDropPayload,
  options: FileDropHandlerOptions
): Promise<void> {
  if (payload.type !== 'drop' || !payload.file) return;

  const file = payload.file as PillDropFile;
  const maxSize = options.maxSize ?? MAX_DROP_BYTES;

  // Refuse if already known to exceed size limit before ingest
  if (typeof file.size === 'number' && file.size > maxSize) {
    options.showMessage("File exceeds 200 MB limit.");
    return;
  }

  const category = categorizeFile(file.name);
  if (category === 'unsupported') {
    options.showMessage("I can't take that file yet");
    return;
  }

  try {
    const dropped = await file.ingest();

    if (dropped.size > maxSize) {
      options.showMessage("File exceeds 200 MB limit.");
      return;
    }

    if (category === 'markdown_text') {
      options.showMessage(`Saved ${dropped.name} to vault`);
      if (options.importVault) await options.importVault(dropped);
    } else if (category === 'epub') {
      options.showMessage(`Imported ${dropped.name}`);
      if (options.importEpub) await options.importEpub(dropped);
    } else if (category === 'audio') {
      options.showMessage(`Transcribing ${dropped.name}`);
      if (options.importAudio) await options.importAudio(dropped);
    }
  } catch (err) {
    options.showMessage(String(err).replace(/^Error:\s*/, ''));
  }
}
