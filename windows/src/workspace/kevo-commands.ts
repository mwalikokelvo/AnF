/**
 * Kevo commands for the global Ctrl/Cmd+K command palette (AnF -> Kevo).
 *
 * The same execution context the voice agent uses (`JarvisActionContext`) backs typed palette
 * commands and spoken voice commands, so "play music" typed or spoken runs the same path.
 */

import type { JarvisActionContext } from './jarvis/voice/jarvis-voice-agent';

export interface PaletteCommand {
  label: string;
  run: () => void;
}

/** Voice commands the owner can fire from the global command palette. All are safe no-ops without context. */
export function kevoCommands(ctx: JarvisActionContext): PaletteCommand[] {
  const playMusic = () => ctx.playMusic?.();
  const pauseMusic = () => ctx.pauseMusic?.();
  const nextTrack = () => ctx.nextTrack?.();
  const previousTrack = () => ctx.previousTrack?.();
  const switchTo = (view: string) => () => { ctx.switchView?.(view); };
  return [
    { label: 'Kevo · play music', run: () => { playMusic(); } },
    { label: 'Kevo · pause music', run: () => { pauseMusic(); } },
    { label: 'Kevo · next track', run: () => { nextTrack(); } },
    { label: 'Kevo · previous track', run: () => { previousTrack(); } },
    { label: 'Kevo · open Music Hub', run: switchTo('music') },
    { label: 'Kevo · open Kevo desk', run: switchTo('jarvis') },
  ];
}
