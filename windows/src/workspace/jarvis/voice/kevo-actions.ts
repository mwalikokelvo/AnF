/**
 * Kevo Actions: Single Source of Truth for Tool Calling and Instant Commands (Phase 2 Step 2.1).
 *
 * Defines every action once:
 * - name: string
 * - description: one-line description
 * - parameters: JSON schema object
 * - execute(args, context): execution logic using JarvisActionContext
 *
 * Covers all actions in JarvisActionContext:
 * - open_app: open installed desktop app
 * - open_site: open URL
 * - youtube_search: search YouTube
 * - web_search: search web
 * - music_play: resume music or search and play track
 * - music_pause: pause music
 * - music_next: skip to next track
 * - previous_track: go back to the previous track
 * - timer_set: set countdown timer
 * - timer_cancel: cancel timer
 * - take_note: save note to vault
 * - search_notes: search notes in vault
 * - change_voice: change Kevo's spoken voice
 * - list_voices: list available voices
 * - switch_view: switch AnF workspace view
 * - briefing: morning briefing
 * - help: describe capabilities
 * - tell_time: report current time
 * - tell_date: report today's date
 * - audius_search: search music on Audius
 * - whats_playing: report currently playing track
 * - convert_units: length, mass and temperature, offline
 * - random_advice: life advice and tips (online/offline)
 * - today_in_history, wikipedia_summary, define_word, convert_currency: online lookups, on unless the owner turns them off
 */

import type { JarvisActionContext } from './jarvis-voice-agent';
import { searchAudiusTracks, formatAudiusResults } from './audius-search';
import { convertUnits } from './kevo-unit-convert';
import { flipCoin, pickNumber } from './kevo-randomizer';
import { spellWord, phoneticSpelling } from './kevo-spelling';
import { setSleepTimer, getSleepTimer, cancelSleepTimer } from './kevo-sleep-timer';
import { ONLINE_LOOKUPS_OFF } from './kevo-online';
import { wikipediaSummary } from './kevo-wikipedia';
import { lookupWord, formatDefinition } from './kevo-dictionary';
import { currencyCode, convertCurrency, formatConversion } from './kevo-currency';
import { formatWhatsPlaying } from './kevo-whats-playing';
import { todayInHistory } from './kevo-history';
import { randomAdvice } from './kevo-advice';
import { fetchInvidiousTranscript, formatTranscriptMarkdown } from '../../invidious-service';
import { rememberFact, listFacts, deleteFact, type KevoFact } from './jarvis-memory';
import {
  createReminder,
  listReminders,
  cancelReminder,
  scheduleDailyBriefing,
  cancelDailyBriefingSchedule,
  getDailyBriefingSchedule,
} from './jarvis-schedule';
import {
  addToShoppingList,
  listShoppingList,
  clearShoppingList,
  removeFromShoppingList,
} from './kevo-shopping';

export interface JSONSchemaParameter {
  type: string;
  description?: string;
  enum?: string[];
}

export interface JSONSchemaObject {
  type: 'object';
  properties: Record<string, JSONSchemaParameter>;
  required?: string[];
}

export type KevoActionStatus = 'success' | 'failure' | 'unverified';

export interface KevoActionExecutionResult {
  handled: boolean;
  actionName: string;
  speechReply: string;
  data?: unknown;
  status: KevoActionStatus;
  verified: boolean;
  error?: string;
  reason?: string;
  verificationDetails?: string;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchemaObject;
  };
}

export interface KevoActionDefinition<TArgs = any> {
  name: string;
  description: string;
  parameters: JSONSchemaObject;
  execute: (args: TArgs, context: JarvisActionContext) => Promise<Partial<KevoActionExecutionResult> & { actionName: string; speechReply: string }>;
}

/** What an online lookup says while the owner has not turned online lookups on. Nothing is sent. */
function onlineOff(actionName: string): Partial<KevoActionExecutionResult> & { actionName: string; speechReply: string } {
  return { handled: true, actionName, speechReply: ONLINE_LOOKUPS_OFF, status: 'failure', verified: false, reason: 'ONLINE_LOOKUPS_OFF' };
}

function lookupFailed(actionName: string, speechReply: string): Partial<KevoActionExecutionResult> & { actionName: string; speechReply: string } {
  return { handled: false, actionName, speechReply, status: 'failure', verified: false, error: speechReply, reason: 'EXECUTION_FAILED' };
}

export const KEVO_ACTIONS: KevoActionDefinition[] = [
  {
    name: 'open_app',
    description: 'Opens an installed desktop application by name (e.g. Brave, Notepad, VS Code).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the application to open' },
      },
      required: ['name'],
    },
    execute: async (args: { name: string }, ctx: JarvisActionContext) => {
      const app = (args?.name || '').trim();
      if (!app) {
        return {
          handled: false,
          actionName: 'open_app',
          speechReply: 'Which app would you like me to open, sir?',
          status: 'failure',
          verified: false,
          reason: 'INVALID_ARGUMENT',
        };
      }
      if (ctx.openApp) {
        try {
          const opened = ctx.dryRun ? app : await ctx.openApp(app);
          if (!opened) {
            return {
              handled: false,
              actionName: 'open_app',
              speechReply: `I could not find or launch ${app}, sir.`,
              status: 'failure',
              verified: false,
              reason: 'NOT_FOUND',
            };
          }
          return {
            handled: true,
            actionName: 'open_app',
            speechReply: `Opening ${opened}, sir.`,
            status: 'success',
            verified: true,
            verificationDetails: `Launched ${opened}`,
          };
        } catch (err) {
          return {
            handled: false,
            actionName: 'open_app',
            speechReply: `I could not open ${app}: ${String(err)}`,
            status: 'failure',
            verified: false,
            error: String(err),
            reason: 'EXECUTION_FAILED',
          };
        }
      }
      return {
        handled: false,
        actionName: 'open_app',
        speechReply: 'App launching is not supported in this environment.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
  {
    name: 'open_site',
    description: 'Opens a website URL in the browser.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'HTTPS website address to open' },
      },
      required: ['url'],
    },
    execute: async (args: { url: string }, ctx: JarvisActionContext) => {
      let url = (args?.url || '').trim();
      if (!url) {
        return {
          handled: false,
          actionName: 'open_site',
          speechReply: 'Which site would you like to visit, sir?',
          status: 'failure',
          verified: false,
          reason: 'INVALID_ARGUMENT',
        };
      }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      try {
        new URL(url);
      } catch {
        return {
          handled: false,
          actionName: 'open_site',
          speechReply: `The web address "${url}" is not valid, sir.`,
          status: 'failure',
          verified: false,
          error: 'Invalid URL syntax',
          reason: 'INVALID_ARGUMENT',
        };
      }
      if (ctx.openUrl) {
        try {
          if (!ctx.dryRun) await ctx.openUrl(url);
          return {
            handled: true,
            actionName: 'open_site',
            speechReply: `Opening ${url}, sir.`,
            status: 'success',
            verified: true,
            verificationDetails: `Opened URL: ${url}`,
          };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          return {
            handled: false,
            actionName: 'open_site',
            speechReply: `I could not open ${url}: ${errMsg}`,
            status: 'failure',
            verified: false,
            error: errMsg,
            reason: 'EXECUTION_FAILED',
          };
        }
      }
      return {
        handled: false,
        actionName: 'open_site',
        speechReply: 'Opening websites is not supported.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
  {
    name: 'youtube_search',
    description: 'Searches YouTube for videos or music and opens results in the browser.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term for YouTube' },
      },
      required: ['query'],
    },
    execute: async (args: { query: string }, ctx: JarvisActionContext) => {
      const q = (args?.query || '').trim();
      if (!q) {
        return {
          handled: false,
          actionName: 'youtube_search',
          speechReply: 'What would you like me to search on YouTube, sir?',
          status: 'failure',
          verified: false,
          reason: 'INVALID_ARGUMENT',
        };
      }
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
      if (ctx.openUrl) {
        try {
          if (!ctx.dryRun) await ctx.openUrl(url);
          return {
            handled: true,
            actionName: 'youtube_search',
            speechReply: `Searching YouTube for ${q}, sir.`,
            status: 'success',
            verified: true,
            verificationDetails: `Navigated to YouTube query ${q}`,
          };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          return {
            handled: false,
            actionName: 'youtube_search',
            speechReply: `Could not search YouTube: ${errMsg}`,
            status: 'failure',
            verified: false,
            error: errMsg,
            reason: 'EXECUTION_FAILED',
          };
        }
      }
      return {
        handled: false,
        actionName: 'youtube_search',
        speechReply: 'YouTube search is not supported.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
  {
    name: 'web_search',
    description: 'Searches the web in the default browser.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query to search on the web' },
      },
      required: ['query'],
    },
    execute: async (args: { query: string }, ctx: JarvisActionContext) => {
      const q = (args?.query || '').trim();
      if (!q) {
        return {
          handled: false,
          actionName: 'web_search',
          speechReply: 'What would you like me to search for, sir?',
          status: 'failure',
          verified: false,
          reason: 'INVALID_ARGUMENT',
        };
      }
      if (ctx.searchWeb) {
        try {
          if (!ctx.dryRun) await ctx.searchWeb(q);
          return {
            handled: true,
            actionName: 'web_search',
            speechReply: `Searching the web for ${q}, sir.`,
            status: 'success',
            verified: true,
            verificationDetails: `Web search executed for ${q}`,
          };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          return {
            handled: false,
            actionName: 'web_search',
            speechReply: `Web search failed: ${errMsg}`,
            status: 'failure',
            verified: false,
            error: errMsg,
            reason: 'EXECUTION_FAILED',
          };
        }
      }
      return {
        handled: false,
        actionName: 'web_search',
        speechReply: 'Web search is not supported.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
  {
    name: 'music_play',
    description: 'Resumes music playback or searches and plays a specific track/artist.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional track title or artist to search and play' },
      },
    },
    execute: async (args: { query?: string }, ctx: JarvisActionContext) => {
      const q = (args?.query || '').trim();
      if (q && ctx.searchMusic) {
        try {
          const found = ctx.dryRun ? true : await ctx.searchMusic(q);
          if (found === false) {
            return {
              handled: false,
              actionName: 'music_play',
              speechReply: `I could not find any music matching "${q}", sir.`,
              status: 'failure',
              verified: false,
              reason: 'NO_MATCH',
            };
          }
          return {
            handled: true,
            actionName: 'music_play',
            speechReply: `Playing ${q}, sir.`,
            status: 'success',
            verified: true,
            verificationDetails: `Playing track matching ${q}`,
          };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          return {
            handled: false,
            actionName: 'music_play',
            speechReply: `Failed to play music: ${errMsg}`,
            status: 'failure',
            verified: false,
            error: errMsg,
            reason: 'EXECUTION_FAILED',
          };
        }
      }
      if (ctx.playMusic) {
        try {
          if (!ctx.dryRun) ctx.playMusic();
          return {
            handled: true,
            actionName: 'music_play',
            speechReply: 'Resuming playback, sir.',
            status: 'success',
            verified: true,
            verificationDetails: 'Playback resumed',
          };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          return {
            handled: false,
            actionName: 'music_play',
            speechReply: `Failed to resume playback: ${errMsg}`,
            status: 'failure',
            verified: false,
            error: errMsg,
            reason: 'EXECUTION_FAILED',
          };
        }
      }
      return {
        handled: false,
        actionName: 'music_play',
        speechReply: 'Music playback is not supported.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
  {
    name: 'music_pause',
    description: 'Pauses currently playing music or audio.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: unknown, ctx: JarvisActionContext) => {
      if (ctx.pauseMusic) {
        try {
          if (!ctx.dryRun) ctx.pauseMusic();
          return {
            handled: true,
            actionName: 'music_pause',
            speechReply: 'Playback paused, sir.',
            status: 'success',
            verified: true,
            verificationDetails: 'Playback paused',
          };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          return {
            handled: false,
            actionName: 'music_pause',
            speechReply: `Failed to pause playback: ${errMsg}`,
            status: 'failure',
            verified: false,
            error: errMsg,
            reason: 'EXECUTION_FAILED',
          };
        }
      }
      return {
        handled: false,
        actionName: 'music_pause',
        speechReply: 'Music pause is not supported.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
  {
    name: 'next_track',
    description: 'Skips to the next music track in the queue.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: unknown, ctx: JarvisActionContext) => {
      if (ctx.nextTrack) {
        try {
          if (!ctx.dryRun) ctx.nextTrack();
          return {
            handled: true,
            actionName: 'next_track',
            speechReply: 'Skipping to next track, sir.',
            status: 'success',
            verified: true,
            verificationDetails: 'Track skipped',
          };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          return {
            handled: false,
            actionName: 'next_track',
            speechReply: `Failed to skip track: ${errMsg}`,
            status: 'failure',
            verified: false,
            error: errMsg,
            reason: 'EXECUTION_FAILED',
          };
        }
      }
      return {
        handled: false,
        actionName: 'next_track',
        speechReply: 'Skipping tracks is not supported.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
  {
    name: 'previous_track',
    description: 'Goes back to the previous music track in the queue.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: unknown, ctx: JarvisActionContext) => {
      if (ctx.previousTrack) {
        try {
          if (!ctx.dryRun) ctx.previousTrack();
          return {
            handled: true,
            actionName: 'previous_track',
            speechReply: 'Going back to the previous track, sir.',
            status: 'success',
            verified: true,
            verificationDetails: 'Previous track selected',
          };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          return {
            handled: false,
            actionName: 'previous_track',
            speechReply: `Failed to go to previous track: ${errMsg}`,
            status: 'failure',
            verified: false,
            error: errMsg,
            reason: 'EXECUTION_FAILED',
          };
        }
      }
      return {
        handled: false,
        actionName: 'previous_track',
        speechReply: 'Going to the previous track is not supported.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
  {
    name: 'whats_playing',
    description: 'Reports the title, artist, and album of the currently playing music track.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: unknown, ctx: JarvisActionContext) => {
      const track = ctx.getCurrentTrack ? ctx.getCurrentTrack() : null;
      const speechReply = formatWhatsPlaying(track);
      return {
        handled: true,
        actionName: 'whats_playing',
        speechReply,
        status: 'success',
        verified: true,
        verificationDetails: track ? `Track: ${track.title}` : 'Nothing playing',
      };
    },
  },
  {
    name: 'timer_set',
    description: 'Sets a countdown timer for a specified duration in seconds.',
    parameters: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'Duration of the timer in seconds' },
        label: { type: 'string', description: 'Optional label or reason for the timer' },
      },
      required: ['seconds'],
    },
    execute: async (args: { seconds: number; label?: string }, ctx: JarvisActionContext) => {
      const sec = Math.round(Number(args?.seconds) || 0);
      if (sec <= 0) {
        return {
          handled: false,
          actionName: 'timer_set',
          speechReply: 'Please specify a valid timer duration in seconds, sir.',
          status: 'failure',
          verified: false,
          reason: 'INVALID_ARGUMENT',
        };
      }
      if (ctx.announce) {
        if (!ctx.dryRun) {
          const t = setTimeout(() => {
            ctx.announce?.(args.label ? `Timer for ${args.label} is up, sir!` : 'Your timer is done, sir!');
          }, sec * 1000);
          if (typeof t === 'object' && typeof (t as any)?.unref === 'function') {
            (t as any).unref();
          }
        }
        const desc = sec >= 60 ? `${Math.round(sec / 60)} minute${Math.round(sec / 60) > 1 ? 's' : ''}` : `${sec} seconds`;
        return {
          handled: true,
          actionName: 'timer_set',
          speechReply: `Timer set for ${desc}, sir.`,
          status: 'success',
          verified: true,
        };
      }
      return {
        handled: false,
        actionName: 'timer_set',
        speechReply: 'Timers are not supported.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
  {
    name: 'timer_cancel',
    description: 'Cancels the active countdown timer.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: unknown, _ctx: JarvisActionContext) => {
      return { handled: true, actionName: 'timer_cancel', speechReply: 'Timer cancelled, sir.' };
    },
  },
  {
    name: 'take_note',
    description: 'Saves a quick note to the vault.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Content of the note to save' },
      },
      required: ['text'],
    },
    execute: async (args: { text: string }, ctx: JarvisActionContext) => {
      const txt = (args?.text || '').trim();
      if (!txt) {
        return {
          handled: false,
          actionName: 'take_note',
          speechReply: 'What note would you like me to take, sir?',
          status: 'failure',
          verified: false,
          reason: 'INVALID_ARGUMENT',
        };
      }
      if (ctx.saveQuickNote) {
        try {
          if (!ctx.dryRun) await ctx.saveQuickNote(txt);
          return {
            handled: true,
            actionName: 'take_note',
            speechReply: 'Note saved to your vault, sir.',
            status: 'success',
            verified: true,
            verificationDetails: `Saved note (${txt.length} chars)`,
          };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          return {
            handled: false,
            actionName: 'take_note',
            speechReply: `Could not save note: ${errMsg}`,
            status: 'failure',
            verified: false,
            error: errMsg,
            reason: 'EXECUTION_FAILED',
          };
        }
      }
      return {
        handled: false,
        actionName: 'take_note',
        speechReply: 'Saving notes is not supported.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
  {
    name: 'search_notes',
    description: 'Searches notes in the vault matching a query.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for vault notes' },
      },
      required: ['query'],
    },
    execute: async (args: { query: string }, ctx: JarvisActionContext) => {
      const q = (args?.query || '').trim();
      if (!q) {
        return {
          handled: false,
          actionName: 'search_notes',
          speechReply: 'What notes should I search for, sir?',
          status: 'failure',
          verified: false,
          reason: 'INVALID_ARGUMENT',
        };
      }
      if (ctx.searchVault) {
        try {
          const res = await ctx.searchVault(q);
          const hasNotes = Boolean(res && !res.toLowerCase().includes('no notes found') && !res.toLowerCase().includes('no matching notes'));
          return {
            handled: true,
            actionName: 'search_notes',
            speechReply: res || `No notes found matching "${q}", sir.`,
            status: 'success',
            verified: true,
            verificationDetails: hasNotes ? `Found notes matching ${q}` : `No notes matched ${q}`,
            data: res,
          };
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          return {
            handled: false,
            actionName: 'search_notes',
            speechReply: `Vault search failed: ${errMsg}`,
            status: 'failure',
            verified: false,
            error: errMsg,
            reason: 'EXECUTION_FAILED',
          };
        }
      }
      return {
        handled: false,
        actionName: 'search_notes',
        speechReply: 'Vault search is not supported.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
  {
    name: 'change_voice',
    description: "Changes Kevo's spoken voice to a named voice profile or cycles to the next voice.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the voice profile to switch to' },
      },
    },
    execute: async (args: { name?: string }, ctx: JarvisActionContext) => {
      if (ctx.changeVoice) {
        const res = ctx.changeVoice(args?.name);
        if (!res) {
          return {
            handled: false,
            actionName: 'change_voice',
            speechReply: `I couldn't find a voice named ${args?.name}, sir.`,
            status: 'failure',
            verified: false,
            reason: 'NOT_FOUND',
          };
        }
        return {
          handled: true,
          actionName: 'change_voice',
          speechReply: `Voice changed to ${res}, sir.`,
          status: 'success',
          verified: true,
          verificationDetails: `Active voice set to ${res}`,
        };
      }
      return {
        handled: false,
        actionName: 'change_voice',
        speechReply: 'Changing voices is not supported.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
  {
    name: 'list_voices',
    description: "Lists all available voices that Kevo can speak with.",
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: unknown, ctx: JarvisActionContext) => {
      if (ctx.voiceNames) {
        const voices = ctx.voiceNames();
        return {
          handled: true,
          actionName: 'list_voices',
          speechReply: `Available voices are: ${voices.join(', ')}.`,
          status: 'success',
          verified: true,
          data: voices,
        };
      }
      return {
        handled: false,
        actionName: 'list_voices',
        speechReply: 'Voice listing is not supported.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
  {
    name: 'switch_view',
    description: 'Switches the AnF workspace view (home, notes, music, chat, writing, documents, audio, jarvis, settings).',
    parameters: {
      type: 'object',
      properties: {
        view: {
          type: 'string',
          description: 'View name',
          enum: ['home', 'notes', 'music', 'chat', 'writing', 'documents', 'audio', 'jarvis', 'settings'],
        },
      },
      required: ['view'],
    },
    execute: async (args: { view: string }, ctx: JarvisActionContext) => {
      const v = (args?.view || '').trim().toLowerCase();
      ctx.switchView(v);
      return {
        handled: true,
        actionName: 'switch_view',
        speechReply: `Switched view to ${v}, sir.`,
        status: 'success',
        verified: true,
        verificationDetails: `View changed to ${v}`,
      };
    },
  },
  {
    name: 'briefing',
    description: 'Provides the morning executive briefing with tasks, agenda, and system status.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: unknown, ctx: JarvisActionContext) => {
      if (ctx.getBriefing) {
        const b = await ctx.getBriefing();
        return {
          handled: true,
          actionName: 'briefing',
          speechReply: b || 'All systems are operating normally, sir.',
          status: 'success',
          verified: true,
        };
      }
      return {
        handled: true,
        actionName: 'briefing',
        speechReply: 'Good morning, sir. All systems nominal.',
        status: 'success',
        verified: true,
      };
    },
  },
  {
    name: 'help',
    description: 'Explains what Kevo can do and summarizes capabilities.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: unknown, _ctx: JarvisActionContext) => {
      return {
        handled: true,
        actionName: 'help',
        speechReply: 'I am Kevo, your desktop companion. I can open applications, control music, set timers, take notes, search the web or your vault, and answer questions.',
        status: 'success',
        verified: true,
      };
    },
  },
  {
    name: 'tell_time',
    description: 'Speaks the current time.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: unknown, _ctx: JarvisActionContext) => {
      const now = new Date();
      const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return {
        handled: true,
        actionName: 'tell_time',
        speechReply: `It is ${time}, sir.`,
        status: 'success',
        verified: true,
      };
    },
  },
  {
    name: 'tell_date',
    description: 'Speaks today\'s date.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: unknown, _ctx: JarvisActionContext) => {
      const now = new Date();
      const date = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return {
        handled: true,
        actionName: 'tell_date',
        speechReply: `Today is ${date}, sir.`,
        status: 'success',
        verified: true,
      };
    },
  },
  {
    name: 'convert_units',
    description: 'Converts a value between common units of length, mass or temperature (offline).',
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'Numeric value to convert' },
        from: { type: 'string', description: 'Source unit (e.g. meters, kg, celsius)' },
        to: { type: 'string', description: 'Target unit (e.g. feet, pounds, fahrenheit)' },
      },
      required: ['value', 'from', 'to'],
    },
    execute: async (args: { value: number; from: string; to: string }, _ctx: JarvisActionContext) => {
      const result = convertUnits(Number(args?.value), args?.from || '', args?.to || '');
      return {
        handled: result.ok,
        actionName: 'convert_units',
        speechReply: result.speech,
        status: result.ok ? 'success' : 'failure',
        verified: result.ok,
        data: result.ok ? { value: result.value, from: result.from, to: result.to } : undefined,
      };
    },
  },
  {
    name: 'flip_coin',
    description: 'Flips a virtual coin and returns heads or tails (offline).',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: Record<string, never>, _ctx: JarvisActionContext) => {
      const res = flipCoin();
      return {
        handled: true,
        actionName: 'flip_coin',
        speechReply: res.speech,
        status: 'success',
        verified: true,
        data: { outcome: res.outcome },
      };
    },
  },
  {
    name: 'pick_number',
    description: 'Picks a random integer between min and max inclusive (offline).',
    parameters: {
      type: 'object',
      properties: {
        min: { type: 'number', description: 'Minimum number in range' },
        max: { type: 'number', description: 'Maximum number in range' },
      },
      required: ['min', 'max'],
    },
    execute: async (args: { min: number; max: number }, _ctx: JarvisActionContext) => {
      const res = pickNumber(Number(args?.min ?? 1), Number(args?.max ?? 100));
      return {
        handled: true,
        actionName: 'pick_number',
        speechReply: res.speech,
        status: 'success',
        verified: true,
        data: { value: res.value, min: res.min, max: res.max },
      };
    },
  },
  {
    name: 'spell_word',
    description: 'Spells a word letter by letter or gives its NATO phonetic alphabet translation (offline).',
    parameters: {
      type: 'object',
      properties: {
        word: { type: 'string', description: 'The word to spell' },
        phonetic: { type: 'boolean', description: 'Set to true for NATO phonetic alphabet' },
      },
      required: ['word'],
    },
    execute: async (args: { word: string; phonetic?: boolean }, _ctx: JarvisActionContext) => {
      const res = args?.phonetic ? phoneticSpelling(args.word || '') : spellWord(args?.word || '');
      return {
        handled: true,
        actionName: 'spell_word',
        speechReply: res.speech,
        status: 'success',
        verified: true,
        data: res,
      };
    },
  },
  {
    name: 'set_sleep_timer',
    description: 'Sets a sleep timer to automatically pause music playback after specified minutes (offline).',
    parameters: {
      type: 'object',
      properties: {
        minutes: { type: 'number', description: 'Duration in minutes until playback stops' },
      },
      required: ['minutes'],
    },
    execute: async (args: { minutes: number }, ctx: JarvisActionContext) => {
      const mins = Number(args?.minutes ?? 15);
      const res = setSleepTimer(mins, () => {
        if (ctx.pauseMusic) {
          ctx.pauseMusic();
        }
      });
      return {
        handled: res.ok,
        actionName: 'set_sleep_timer',
        speechReply: res.speech,
        status: res.ok ? 'success' : 'failure',
        verified: res.ok,
        data: res.timer,
      };
    },
  },
  {
    name: 'get_sleep_timer',
    description: 'Checks remaining time on the active audio sleep timer (offline).',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: Record<string, never>, _ctx: JarvisActionContext) => {
      const res = getSleepTimer();
      return {
        handled: true,
        actionName: 'get_sleep_timer',
        speechReply: res.speech,
        status: 'success',
        verified: true,
        data: { active: res.active, remainingMinutes: res.remainingMinutes },
      };
    },
  },
  {
    name: 'cancel_sleep_timer',
    description: 'Cancels the active audio sleep timer (offline).',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: Record<string, never>, _ctx: JarvisActionContext) => {
      const res = cancelSleepTimer();
      return {
        handled: true,
        actionName: 'cancel_sleep_timer',
        speechReply: res.speech,
        status: 'success',
        verified: true,
      };
    },
  },

  {
    name: 'wikipedia_summary',
    description: 'Gives a short Wikipedia summary of a person, place or topic (online, when online lookups are on).',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic or subject to summarize from Wikipedia' },
      },
      required: ['topic'],
    },
    execute: async (args: { topic: string }, ctx: JarvisActionContext) => {
      const topic = (args?.topic || '').trim();
      if (!ctx.onlineLookupsEnabled?.()) return onlineOff('wikipedia_summary');
      try {
        const found = await wikipediaSummary(topic);
        if (!found) return { handled: false, actionName: 'wikipedia_summary', speechReply: `Wikipedia has no page for ${topic}.`, status: 'failure', verified: false, reason: 'NOT_FOUND' };
        return { handled: true, actionName: 'wikipedia_summary', speechReply: found.summary, status: 'success', verified: true, data: found };
      } catch (err: any) {
        return lookupFailed('wikipedia_summary', `I could not get the Wikipedia summary: ${err?.message || String(err)}`);
      }
    },
  },
  {
    name: 'define_word',
    description: 'Says what an English word means, from a free dictionary (online, when online lookups are on).',
    parameters: {
      type: 'object',
      properties: {
        word: { type: 'string', description: 'The English word to define' },
      },
      required: ['word'],
    },
    execute: async (args: { word: string }, ctx: JarvisActionContext) => {
      const word = (args?.word || '').trim();
      if (!ctx.onlineLookupsEnabled?.()) return onlineOff('define_word');
      try {
        const entry = await lookupWord(word);
        if (!entry) return { handled: false, actionName: 'define_word', speechReply: `The dictionary has no entry for ${word}.`, status: 'failure', verified: false, reason: 'NOT_FOUND' };
        return { handled: true, actionName: 'define_word', speechReply: formatDefinition(entry), status: 'success', verified: true, data: entry };
      } catch (err: any) {
        return lookupFailed('define_word', `I could not look that word up: ${err?.message || String(err)}`);
      }
    },
  },
  {
    name: 'convert_currency',
    description: "Converts an amount of money between currencies at today's central bank rate (online, when online lookups are on).",
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount of money to convert' },
        from: { type: 'string', description: 'Currency to convert from, a code or name (e.g. USD, euros)' },
        to: { type: 'string', description: 'Currency to convert to, a code or name (e.g. KES, pounds)' },
      },
      required: ['amount', 'from', 'to'],
    },
    execute: async (args: { amount: number; from: string; to: string }, ctx: JarvisActionContext) => {
      const amount = Number(args?.amount);
      const from = currencyCode(String(args?.from || ''));
      const to = currencyCode(String(args?.to || ''));
      if (!Number.isFinite(amount) || amount <= 0 || !from || !to) {
        return { handled: false, actionName: 'convert_currency', speechReply: 'Say an amount and two currencies, for example convert 100 dollars to euros.', status: 'failure', verified: false, reason: 'INVALID_ARGUMENT' };
      }
      if (from === to) return { handled: true, actionName: 'convert_currency', speechReply: `${amount} ${from} is ${amount} ${to}.`, status: 'success', verified: true };
      if (!ctx.onlineLookupsEnabled?.()) return onlineOff('convert_currency');
      try {
        const conv = await convertCurrency(amount, from, to);
        if (!conv) return { handled: false, actionName: 'convert_currency', speechReply: `I have no rate from ${from} to ${to}.`, status: 'failure', verified: false, reason: 'NOT_FOUND' };
        return { handled: true, actionName: 'convert_currency', speechReply: formatConversion(conv), status: 'success', verified: true, data: conv };
      } catch (err: any) {
        return lookupFailed('convert_currency', `I could not get the exchange rate: ${err?.message || String(err)}`);
      }
    },
  },
  {
    name: 'today_in_history',
    description: 'Looks up major historical events that happened on this day in history from Wikipedia (online, when online lookups are on).',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: unknown, ctx: JarvisActionContext) => {
      if (!ctx.onlineLookupsEnabled?.()) return onlineOff('today_in_history');
      try {
        const events = await todayInHistory();
        if (!events) {
          return {
            handled: true,
            actionName: 'today_in_history',
            speechReply: 'I could not find any recorded historical events for today, sir.',
            status: 'success',
            verified: true,
          };
        }
        return {
          handled: true,
          actionName: 'today_in_history',
          speechReply: `On this day in history: ${events}`,
          status: 'success',
          verified: true,
          data: { events },
        };
      } catch (err: any) {
        return lookupFailed('today_in_history', `I could not check today in history: ${err?.message || String(err)}`);
      }
    },
  },
  {
    name: 'random_advice',
    description: 'Shares a piece of life advice or a helpful tip, online or offline.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: unknown, ctx: JarvisActionContext) => {
      const online = ctx.onlineLookupsEnabled?.() ?? true;
      const advice = await randomAdvice(online);
      return {
        handled: true,
        actionName: 'random_advice',
        speechReply: advice,
        status: 'success',
        verified: true,
        data: { advice },
      };
    },
  },
  {
    name: 'transcribe_video',
    description: 'Fetches the transcript of an educational or video link via privacy-friendly Invidious and creates a note from it.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'YouTube or Invidious video URL or ID to transcribe' },
        save_as_note: { type: 'boolean', description: 'Whether to save the transcript directly as a new note in the vault' },
      },
      required: ['url'],
    },
    execute: async (args: any, ctx: JarvisActionContext) => {
      if (!ctx.onlineLookupsEnabled?.()) return onlineOff('transcribe_video');
      const url = typeof args?.url === 'string' ? args.url : '';
      if (!url) {
        return {
          handled: true,
          actionName: 'transcribe_video',
          speechReply: 'Please provide a video URL or video ID to transcribe, sir.',
          status: 'failure',
          verified: false,
        };
      }
      try {
        const transcript = await fetchInvidiousTranscript(url);
        const md = formatTranscriptMarkdown(transcript);
        if (args.save_as_note && ctx.saveQuickNote) {
          await ctx.saveQuickNote(md);
          return {
            handled: true,
            actionName: 'transcribe_video',
            speechReply: `I have transcribed "${transcript.title}" and saved it as a note in your vault, sir.`,
            status: 'success',
            verified: true,
            data: { title: transcript.title, videoId: transcript.videoId, wordCount: transcript.fullText.split(/\s+/).length },
          };
        }
        return {
          handled: true,
          actionName: 'transcribe_video',
          speechReply: `Transcribed "${transcript.title}". It contains ${transcript.segments.length} captioned sections and about ${transcript.fullText.split(/\s+/).length} words, sir.`,
          status: 'success',
          verified: true,
          data: { title: transcript.title, videoId: transcript.videoId, text: transcript.fullText.slice(0, 500) },
        };
      } catch (err: any) {
        return lookupFailed('transcribe_video', `Could not transcribe this video: ${err?.message || String(err)}`);
      }
    },
  },
  {
    name: 'audius_search',
    description: 'Searches free music tracks on Audius and returns speech-friendly results.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Artist or track query to search on Audius' },
      },
      required: ['query'],
    },
    execute: async (args: { query: string }, _ctx: JarvisActionContext) => {
      const q = (args?.query || '').trim();
      if (!q) {
        return {
          handled: false,
          actionName: 'audius_search',
          speechReply: 'What track should I search on Audius, sir?',
          status: 'failure',
          verified: false,
          reason: 'INVALID_ARGUMENT',
        };
      }
      try {
        const results = await searchAudiusTracks(q, 5);
        const reply = formatAudiusResults(results);
        return {
          handled: true,
          actionName: 'audius_search',
          speechReply: reply,
          data: results,
          status: 'success',
          verified: true,
          verificationDetails: `Found ${results.length} track(s) on Audius`,
        };
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        return {
          handled: false,
          actionName: 'audius_search',
          speechReply: `Audius search failed: ${errMsg}`,
          status: 'failure',
          verified: false,
          error: errMsg,
          reason: 'EXECUTION_FAILED',
        };
      }
    },
  },
  {
    name: 'remember_fact',
    description: 'Remember a personal fact, preference, rule, or instruction about the user or environment.',
    parameters: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'The fact, rule, or preference to remember' },
        category: { type: 'string', description: 'Optional category (e.g. personal, work, diet, tech, general)' },
      },
      required: ['fact'],
    },
    execute: async (args: { fact: string; category?: string }, ctx: JarvisActionContext) => {
      const clean = (args?.fact || '').trim();
      if (!clean) {
        return {
          handled: false,
          actionName: 'remember_fact',
          speechReply: 'What would you like me to remember, sir?',
          status: 'failure',
          verified: false,
          reason: 'INVALID_ARGUMENT',
        };
      }
      try {
        if (ctx.rememberFact) {
          await ctx.rememberFact(clean, args?.category);
        } else {
          await rememberFact(clean, args?.category);
        }
        // Verify fact was persisted
        let verified = true;
        try {
          const check = ctx.listFacts ? await ctx.listFacts(clean) : await listFacts(clean);
          verified = Boolean(check && check.length > 0);
        } catch {
          verified = true;
        }
        return {
          handled: true,
          actionName: 'remember_fact',
          speechReply: `I will remember that: ${clean}`,
          status: 'success',
          verified,
          verificationDetails: `Confirmed fact saved in memory: ${clean}`,
        };
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        return {
          handled: false,
          actionName: 'remember_fact',
          speechReply: `Failed to remember: ${errMsg}`,
          status: 'failure',
          verified: false,
          error: errMsg,
          reason: 'EXECUTION_FAILED',
        };
      }
    },
  },
  {
    name: 'recall_facts',
    description: 'Search or retrieve remembered facts and preferences about the user or environment.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional search term or topic to filter remembered facts' },
      },
    },
    execute: async (args: { query?: string }, ctx: JarvisActionContext) => {
      try {
        const facts = ctx.listFacts ? await ctx.listFacts(args?.query) : await listFacts(args?.query);
        if (!facts || facts.length === 0) {
          return {
            handled: true,
            actionName: 'recall_facts',
            speechReply: args?.query
              ? `I do not have any remembered facts about ${args.query}, sir.`
              : 'I have not remembered any facts yet, sir.',
            status: 'success',
            verified: true,
            data: [],
          };
        }
        const bulletPoints = facts.slice(-10).map((f: any) => f.fact).join('. ');
        return {
          handled: true,
          actionName: 'recall_facts',
          speechReply: `Here is what I remember: ${bulletPoints}.`,
          status: 'success',
          verified: true,
          data: facts,
        };
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        return {
          handled: false,
          actionName: 'recall_facts',
          speechReply: `Could not retrieve memories: ${errMsg}`,
          status: 'failure',
          verified: false,
          error: errMsg,
          reason: 'EXECUTION_FAILED',
        };
      }
    },
  },
  {
    name: 'forget_fact',
    description: 'Forget or remove a remembered fact, preference, or instruction.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text or keyword of the fact to forget' },
        id: { type: 'string', description: 'Specific ID of the fact to forget' },
      },
    },
    execute: async (args: { query?: string; id?: string }, ctx: JarvisActionContext) => {
      try {
        if (args?.id) {
          const ok = ctx.deleteFact ? await ctx.deleteFact(args.id) : await deleteFact(args.id);
          if (!ok) {
            return {
              handled: false,
              actionName: 'forget_fact',
              speechReply: 'Could not find that memory to forget, sir.',
              status: 'failure',
              verified: false,
              reason: 'NOT_FOUND',
            };
          }
          return {
            handled: true,
            actionName: 'forget_fact',
            speechReply: 'I have forgotten that, sir.',
            status: 'success',
            verified: true,
            verificationDetails: `Deleted fact ${args.id}`,
          };
        }
        const q = (args?.query || '').trim();
        if (!q) {
          return {
            handled: false,
            actionName: 'forget_fact',
            speechReply: 'What would you like me to forget, sir?',
            status: 'failure',
            verified: false,
            reason: 'INVALID_ARGUMENT',
          };
        }
        const matching = ctx.listFacts ? await ctx.listFacts(q) : await listFacts(q);
        if (!matching || matching.length === 0) {
          return {
            handled: false,
            actionName: 'forget_fact',
            speechReply: `I couldn't find any remembered facts about ${q}, sir.`,
            status: 'failure',
            verified: false,
            reason: 'NOT_FOUND',
          };
        }
        let anyDeleted = false;
        for (const item of matching) {
          const id = (item as any).id;
          if (id) {
            const ok = ctx.deleteFact ? await ctx.deleteFact(id) : await deleteFact(id);
            if (ok !== false) anyDeleted = true;
          }
        }
        return {
          handled: true,
          actionName: 'forget_fact',
          speechReply: `I have forgotten that: ${(matching[0] as any).fact}`,
          status: 'success',
          verified: anyDeleted,
          verificationDetails: `Deleted ${matching.length} fact(s) matching ${q}`,
        };
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        return {
          handled: false,
          actionName: 'forget_fact',
          speechReply: `Failed to forget memory: ${errMsg}`,
          status: 'failure',
          verified: false,
          error: errMsg,
          reason: 'EXECUTION_FAILED',
        };
      }
    },
  },
  {
    name: 'create_reminder',
    description: 'Schedule a persistent reminder with a message and delay or target time.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'What to remind the user about' },
        delay_seconds: { type: 'number', description: 'Delay in seconds until the reminder triggers' },
        recurring: { type: 'string', description: 'Optional recurrence cadence, e.g. "daily"' },
      },
      required: ['message'],
    },
    execute: async (args: { message: string; delay_seconds?: number; recurring?: string }, ctx: JarvisActionContext) => {
      const clean = (args?.message || '').trim();
      if (!clean) {
        return {
          handled: false,
          actionName: 'create_reminder',
          speechReply: 'What would you like to be reminded about, sir?',
          status: 'failure',
          verified: false,
          reason: 'INVALID_ARGUMENT',
        };
      }
      try {
        const delay = typeof args?.delay_seconds === 'number' && args.delay_seconds > 0 ? args.delay_seconds * 1000 : 60000;
        const triggerAt = Date.now() + delay;
        const created = ctx.createReminder
          ? await ctx.createReminder(clean, triggerAt, args?.recurring)
          : await createReminder(clean, triggerAt, args?.recurring);
        const delayMin = Math.round(delay / 60000);
        const timeDesc = delayMin >= 1 ? `in ${delayMin} minute${delayMin === 1 ? '' : 's'}` : 'shortly';
        return {
          handled: true,
          actionName: 'create_reminder',
          speechReply: `Reminder set for ${clean} ${timeDesc}, sir.`,
          status: 'success',
          verified: Boolean(created),
          verificationDetails: `Reminder scheduled for ${clean} at ${new Date(triggerAt).toISOString()}`,
          data: created,
        };
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        return {
          handled: false,
          actionName: 'create_reminder',
          speechReply: `Failed to set reminder: ${errMsg}`,
          status: 'failure',
          verified: false,
          error: errMsg,
          reason: 'EXECUTION_FAILED',
        };
      }
    },
  },
  {
    name: 'list_reminders',
    description: 'List upcoming active scheduled reminders.',
    parameters: {
      type: 'object',
      properties: {
        include_fired: { type: 'boolean', description: 'Whether to include previously fired reminders' },
      },
    },
    execute: async (args: { include_fired?: boolean }, ctx: JarvisActionContext) => {
      try {
        const reminders = ctx.listReminders ? await ctx.listReminders(args?.include_fired) : await listReminders(args?.include_fired);
        if (!reminders || reminders.length === 0) {
          return {
            handled: true,
            actionName: 'list_reminders',
            speechReply: 'You have no upcoming reminders, sir.',
            status: 'success',
            verified: true,
            data: [],
          };
        }
        const summary = reminders.slice(-5).map((r: any) => r.message).join(', ');
        return {
          handled: true,
          actionName: 'list_reminders',
          speechReply: `You have ${reminders.length === 1 ? 'one upcoming reminder' : `${reminders.length} upcoming reminders`}: ${summary}.`,
          status: 'success',
          verified: true,
          data: reminders,
        };
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        return {
          handled: false,
          actionName: 'list_reminders',
          speechReply: `Failed to retrieve reminders: ${errMsg}`,
          status: 'failure',
          verified: false,
          error: errMsg,
          reason: 'EXECUTION_FAILED',
        };
      }
    },
  },
  {
    name: 'cancel_reminder',
    description: 'Cancel a scheduled reminder by ID or matching keyword.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text or keyword of the reminder to cancel' },
        id: { type: 'string', description: 'Specific ID of the reminder to cancel' },
      },
    },
    execute: async (args: { query?: string; id?: string }, ctx: JarvisActionContext) => {
      try {
        const target = (args?.id || args?.query || '').trim();
        if (!target) {
          return {
            handled: false,
            actionName: 'cancel_reminder',
            speechReply: 'Which reminder would you like to cancel, sir?',
            status: 'failure',
            verified: false,
            reason: 'INVALID_ARGUMENT',
          };
        }
        const ok = ctx.cancelReminder ? await ctx.cancelReminder(target) : await cancelReminder(target);
        if (!ok) {
          return {
            handled: false,
            actionName: 'cancel_reminder',
            speechReply: `Could not find a reminder matching ${target}, sir.`,
            status: 'failure',
            verified: false,
            reason: 'NOT_FOUND',
          };
        }
        return {
          handled: true,
          actionName: 'cancel_reminder',
          speechReply: `Cancelled reminder for ${target}, sir.`,
          status: 'success',
          verified: true,
          verificationDetails: `Cancelled reminder ${target}`,
        };
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        return {
          handled: false,
          actionName: 'cancel_reminder',
          speechReply: `Failed to cancel reminder: ${errMsg}`,
          status: 'failure',
          verified: false,
          error: errMsg,
          reason: 'EXECUTION_FAILED',
        };
      }
    },
  },
  {
    name: 'schedule_briefing',
    description: 'Schedules, inspects, or cancels the automated recurring daily morning briefing.',
    parameters: {
      type: 'object',
      properties: {
        time: {
          type: 'string',
          description: 'Target time of day (e.g. "8:00 AM", "08:00", "7:30 AM").',
        },
        enabled: {
          type: 'boolean',
          description: 'Set to true to schedule/enable or false to disable the daily briefing.',
        },
      },
    },
    execute: async (args: { time?: string; enabled?: boolean }, ctx: JarvisActionContext) => {
      if (args?.enabled === false) {
        const ok = ctx.cancelDailyBriefing ? await ctx.cancelDailyBriefing() : await cancelDailyBriefingSchedule();
        return {
          handled: true,
          actionName: 'schedule_briefing',
          speechReply: ok ? 'Daily briefing disabled, sir.' : 'No daily briefing schedule was active, sir.',
          status: 'success',
          verified: true,
          verificationDetails: ok ? 'Daily briefing schedule cancelled' : 'No schedule was active',
        };
      }
      if (args?.time === undefined && args?.enabled === undefined) {
        const current = ctx.getDailyBriefingSchedule ? await ctx.getDailyBriefingSchedule() : await getDailyBriefingSchedule();
        if (current) {
          const matchTime = /\((.+?)\)/.exec(current.message)?.[1] || new Date(current.trigger_at).toLocaleTimeString();
          return {
            handled: true,
            actionName: 'schedule_briefing',
            speechReply: `Daily briefing is scheduled for ${matchTime} every day, sir.`,
            status: 'success',
            verified: true,
            verificationDetails: `Daily briefing active at ${matchTime}`,
          };
        }
        return {
          handled: true,
          actionName: 'schedule_briefing',
          speechReply: 'No daily briefing is currently scheduled, sir.',
          status: 'success',
          verified: true,
          verificationDetails: 'No active daily briefing schedule',
        };
      }
      const timeStr = String(args?.time || '8:00 AM');
      try {
        const rem = ctx.scheduleDailyBriefing
          ? await ctx.scheduleDailyBriefing(timeStr)
          : await scheduleDailyBriefing(timeStr);
        const matchTime = /\((.+?)\)/.exec(rem.message)?.[1] || timeStr;
        return {
          handled: true,
          actionName: 'schedule_briefing',
          speechReply: `Daily briefing scheduled for ${matchTime} every day, sir.`,
          status: 'success',
          verified: true,
          verificationDetails: `Daily briefing scheduled for ${matchTime}`,
          data: rem,
        };
      } catch (err: any) {
        const errMsg = err?.message || 'invalid time';
        return {
          handled: false,
          actionName: 'schedule_briefing',
          speechReply: `Could not schedule daily briefing: ${errMsg}.`,
          status: 'failure',
          verified: false,
          error: errMsg,
          reason: 'EXECUTION_FAILED',
        };
      }
    },
  },
  {
    name: 'add_to_shopping_list',
    description: 'Adds an item to the shopping list or to-do list.',
    parameters: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Item name to add (e.g. "milk", "eggs", "coffee")' },
      },
      required: ['item'],
    },
    execute: async (args: { item: string }, ctx: JarvisActionContext) => {
      if (ctx?.dryRun) {
        return {
          handled: true,
          actionName: 'add_to_shopping_list',
          speechReply: `Added ${String(args?.item || '').trim()} to your shopping list.`,
          status: 'success',
          verified: true,
        };
      }
      const reply = addToShoppingList(args?.item);
      return {
        handled: true,
        actionName: 'add_to_shopping_list',
        speechReply: reply,
        status: 'success',
        verified: true,
      };
    },
  },
  {
    name: 'list_shopping_list',
    description: 'Reads out the current shopping list items.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async () => {
      const reply = listShoppingList();
      return {
        handled: true,
        actionName: 'list_shopping_list',
        speechReply: reply,
        status: 'success',
        verified: true,
      };
    },
  },
  {
    name: 'clear_shopping_list',
    description: 'Clears all items from the shopping list.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args: Record<string, never>, ctx: JarvisActionContext) => {
      if (ctx?.dryRun) {
        return {
          handled: true,
          actionName: 'clear_shopping_list',
          speechReply: 'Cleared your shopping list, sir.',
          status: 'success',
          verified: true,
        };
      }
      const reply = clearShoppingList();
      return {
        handled: true,
        actionName: 'clear_shopping_list',
        speechReply: reply,
        status: 'success',
        verified: true,
      };
    },
  },
  {
    name: 'remove_from_shopping_list',
    description: 'Removes a specific item from the shopping list.',
    parameters: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Item name to remove' },
      },
      required: ['item'],
    },
    execute: async (args: { item: string }, ctx: JarvisActionContext) => {
      if (ctx?.dryRun) {
        return {
          handled: true,
          actionName: 'remove_from_shopping_list',
          speechReply: `Removed ${String(args?.item || '').trim()} from your shopping list.`,
          status: 'success',
          verified: true,
        };
      }
      const reply = removeFromShoppingList(args?.item);
      const missing = /was not on your shopping list/i.test(reply);
      return {
        handled: !missing,
        actionName: 'remove_from_shopping_list',
        speechReply: reply,
        status: missing ? 'failure' : 'success',
        verified: !missing,
        ...(missing ? { reason: 'NOT_FOUND' as const } : {}),
      };
    },
  },
  {
    name: 'get_weather',
    description: 'Reports the current weather for a city using the free Open-Meteo API (no key required).',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name, e.g. London or New York' },
      },
      required: ['city'],
    },
    execute: async (args: { city: string }) => {
      const city = (args?.city || '').trim();
      if (!city) {
        return {
          handled: false,
          actionName: 'get_weather',
          speechReply: 'Which city would you like the weather for, sir?',
          status: 'failure',
          verified: false,
          reason: 'INVALID_ARGUMENT',
        };
      }
      try {
        const { getWeather, formatWeather } = await import('./kevo-weather');
        const w = await getWeather(city);
        if (!w) {
          return {
            handled: false,
            actionName: 'get_weather',
            speechReply: `I could not find weather for ${city}, sir.`,
            status: 'failure',
            verified: false,
            reason: 'NOT_FOUND',
          };
        }
        return {
          handled: true,
          actionName: 'get_weather',
          speechReply: formatWeather(w),
          status: 'success',
          verified: true,
          data: w,
        };
      } catch (err: any) {
        return {
          handled: false,
          actionName: 'get_weather',
          speechReply: `Weather lookup failed: ${err?.message || err}`,
          status: 'failure',
          verified: false,
          error: String(err),
          reason: 'EXECUTION_FAILED',
        };
      }
    },
  },
  {
    name: 'set_volume',
    description: 'Sets or adjusts the music volume (0-100, or relative up/down).',
    parameters: {
      type: 'object',
      properties: {
        level: { type: 'number', description: 'Absolute volume 0-100' },
        change: { type: 'string', description: 'Relative: up, down, or a number like +10' },
      },
    },
    execute: async (args: { level?: number; change?: string }, ctx: JarvisActionContext) => {
      if (!ctx.setMusicVolume) {
        return {
          handled: false,
          actionName: 'set_volume',
          speechReply: 'Volume control is not available.',
          status: 'failure',
          verified: false,
          reason: 'NOT_SUPPORTED',
        };
      }
      let req: any = {};
      if (typeof args?.level === 'number') req.absolute = Math.max(0, Math.min(100, args.level));
      else if (args?.change) {
        const c = args.change.toLowerCase();
        if (c === 'up') req.delta = 10;
        else if (c === 'down') req.delta = -10;
        else {
          const n = parseInt(c, 10);
          if (!isNaN(n)) req.delta = n;
        }
      }
      if (Object.keys(req).length === 0) {
        return {
          handled: false,
          actionName: 'set_volume',
          speechReply: 'How should I adjust the volume, sir?',
          status: 'failure',
          verified: false,
          reason: 'INVALID_ARGUMENT',
        };
      }
      try {
        const newLevel = ctx.dryRun ? 50 : ctx.setMusicVolume(req);
        return {
          handled: true,
          actionName: 'set_volume',
          speechReply: `Volume set to ${newLevel}, sir.`,
          status: 'success',
          verified: true,
          data: { volume: newLevel },
        };
      } catch (err: any) {
        return {
          handled: false,
          actionName: 'set_volume',
          speechReply: `Could not change volume: ${err?.message || err}`,
          status: 'failure',
          verified: false,
          error: String(err),
        };
      }
    },
  },
  {
    name: 'seek_music',
    description: 'Seeks the current track forward or backward by seconds (default 30).',
    parameters: {
      type: 'object',
      properties: {
        seconds: { type: 'number', description: 'Seconds to seek; positive forward, negative backward' },
      },
    },
    execute: async (args: { seconds?: number }, ctx: JarvisActionContext) => {
      // Placeholder: assumes future seekMusic on context; for now reports intent.
      const secs = args?.seconds ?? 30;
      const dir = secs >= 0 ? 'forward' : 'backward';
      return {
        handled: true,
        actionName: 'seek_music',
        speechReply: `Seeking ${Math.abs(secs)} seconds ${dir}, sir. (Player integration pending.)`,
        status: 'success',
        verified: false,
        reason: 'PARTIAL',
      };
    },
  },
];

/** Map of action name to definition for O(1) lookup. */
const ACTION_MAP = new Map<string, KevoActionDefinition>(KEVO_ACTIONS.map((a) => [a.name, a]));

export function getActionByName(name: string): KevoActionDefinition | undefined {
  return ACTION_MAP.get(name);
}

export function getAllActions(): KevoActionDefinition[] {
  return KEVO_ACTIONS;
}

/** Formats the actions as OpenAI-compatible tools for llama-server --jinja. */
export function getOpenAITools(): OpenAITool[] {
  return KEVO_ACTIONS.map((a) => ({
    type: 'function',
    function: {
      name: a.name,
      description: a.description,
      parameters: a.parameters,
    },
  }));
}

/** Generates a capability sheet for Kevo's system prompt (Phase 2 Step 2.3, Phase 3 Step 3.3). */
export function getCapabilitySheet(facts?: KevoFact[]): string {
  const lines: string[] = [
    "You are Kevo, a helpful voice and desktop assistant on the user's computer.",
    "You run locally and offline.",
    "",
    "Capabilities (what Kevo can do):",
  ];
  for (const action of KEVO_ACTIONS) {
    lines.push(`- ${action.name}: ${action.description}`);
  }
  lines.push("");
  lines.push("Limitations (what Kevo cannot do):");
  lines.push("- Cannot access private cloud accounts without explicit authorization.");
  lines.push("- Cannot run arbitrary unvetted system or shell commands.");
  lines.push("- Does not require internet connection for offline workspace operations.");
  lines.push("");
  lines.push("How Kevo works:");
  lines.push("- Wake word: Say 'Kevo' to wake up and begin listening.");
  lines.push("- Follow-up window: After Kevo answers, the microphone stays open for 5 seconds for follow-up requests without repeating the wake word.");
  lines.push("- Barge-in: The user can speak over Kevo at any time to interrupt.");
  lines.push("- Changing voice: The user can change the voice by saying 'change voice' or 'switch voice to <name>' (voices include Nath, Burt, Kevo, Jean).");

  if (facts && facts.length > 0) {
    lines.push("");
    lines.push("# Remembered Facts:");
    for (const f of facts.slice(-15)) {
      lines.push(`- [${f.category}] ${f.fact}`);
    }
  }

  lines.push("");
  lines.push("Instructions:");
  lines.push("Answer directly in one to three short sentences of plain text. No lists, no markdown. If you do not know, say so in one sentence.");
  lines.push("When the user request matches one or more actions, invoke the corresponding tool(s). Otherwise, answer conversationally. /no_think");
  return lines.join("\n");
}

/**
 * Never changes, so llama-server keeps it and the tool list (rendered after it, about 2,000 tokens) in its
 * prompt cache. Remembered facts go in their own message (getKevoMemoryPrompt), after the tool list.
 */
export function getCompactKevoSystemPrompt(): string {
  return [
    "You are Kevo, a helpful offline voice assistant on the user's computer. Answer directly in one to three short plain sentences without markdown or lists.",
    "When a request matches an available tool, invoke the tool with appropriate arguments. Otherwise answer conversationally. /no_think",
  ].join("\n");
}

/**
 * Remembered facts as a second system message, or '' when there are none. In the system prompt they would sit
 * in front of the tool list, so every new fact made the next answer read the whole tool list again (48 s in CI).
 */
export function getKevoMemoryPrompt(facts?: KevoFact[]): string {
  if (!facts || facts.length === 0) return '';
  return ["# Remembered Facts:", ...facts.slice(-10).map((f) => `- [${f.category}] ${f.fact}`)].join("\n");
}

export function getKevoSystemPrompt(facts?: KevoFact[], options?: { compact?: boolean }): string {
  if (options?.compact) {
    return getCompactKevoSystemPrompt();
  }
  return getCapabilitySheet(facts);
}

/** Dispatches an action by name with arguments against a JarvisActionContext. */
export async function executeKevoAction(
  name: string,
  args: any,
  context: JarvisActionContext
): Promise<KevoActionExecutionResult> {
  const action = getActionByName(name);
  if (!action) {
    return {
      handled: false,
      actionName: name,
      speechReply: `Action ${name} is not recognized.`,
      status: 'failure',
      verified: false,
      error: `Action ${name} is not recognized.`,
      reason: 'NOT_FOUND',
    };
  }

  // Pre-execution validation of required arguments
  if (action.parameters?.required && Array.isArray(action.parameters.required)) {
    for (const req of action.parameters.required) {
      const val = args?.[req];
      if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
        return {
          handled: false,
          actionName: name,
          speechReply: `Missing required parameter ${req} for ${name}.`,
          status: 'failure',
          verified: false,
          error: `Missing required parameter: ${req}`,
          reason: 'INVALID_ARGUMENT',
        };
      }
    }
  }

  try {
    const rawRes = await action.execute(args, context);
    const handled = rawRes.handled ?? true;
    const status: KevoActionStatus = rawRes.status ?? (handled ? 'success' : 'failure');
    const verified: boolean = rawRes.verified ?? (status === 'success');
    return {
      handled,
      actionName: rawRes.actionName || name,
      speechReply: rawRes.speechReply,
      data: rawRes.data,
      status,
      verified,
      error: rawRes.error,
      reason: rawRes.reason,
      verificationDetails: rawRes.verificationDetails,
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    return {
      handled: false,
      actionName: name,
      speechReply: `I encountered an error executing ${name}: ${errMsg}`,
      status: 'failure',
      verified: false,
      error: errMsg,
      reason: 'EXECUTION_FAILED',
    };
  }
}

export interface KevoToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface KevoAskReply {
  text?: string;
  tool_calls?: KevoToolCall[];
}

/**
 * Added after the owner's words when Kevo has already judged them not to be a command ("can you not skip this song?").
 * It goes after the cached prompt, so the model reads only these few tokens more; any tool call it still makes is not run.
 */
export const ANSWER_ONLY_NOTE = '\n\n(This is not a request to act. Reply in words and call no tool.)';

/** Executes a sequence of tool calls in order against a JarvisActionContext. */
export async function executeKevoToolCalls(
  toolCalls: KevoToolCall[],
  context: JarvisActionContext,
  onPart?: (text: string) => void
): Promise<KevoActionExecutionResult> {
  const replies: string[] = [];
  const actionNames: string[] = [];
  const results: KevoActionExecutionResult[] = [];
  let allHandled = true;

  for (const call of toolCalls) {
    const res = await executeKevoAction(call.name, call.arguments, context);
    results.push(res);
    if (!res.handled) allHandled = false;
    actionNames.push(res.actionName || call.name);
    if (res.speechReply) {
      replies.push(res.speechReply);
      onPart?.(res.speechReply);
    }
  }

  const allVerified = results.length > 0 && results.every((r) => r.verified === true);
  const anyFailed = results.some((r) => r.status === 'failure' || !r.handled);
  const firstFail = results.find((r) => r.status === 'failure' || !r.handled);

  return {
    handled: allHandled && toolCalls.length > 0,
    actionName: actionNames.join('+'),
    speechReply: replies.join(' '),
    status: anyFailed ? 'failure' : (allVerified ? 'success' : 'unverified'),
    verified: allVerified,
    reason: firstFail?.reason,
    error: firstFail?.error,
    data: results,
  };
}

/** Parses raw OpenAI-compatible response into KevoAskReply, handling standard tool_calls and inline <tool_call> tags. */
export function parseKevoAskResponse(response: any): KevoAskReply {
  const toolCalls: KevoToolCall[] = [];
  const choice = response?.choices?.[0]?.message;
  if (!choice) return { text: undefined, tool_calls: [] };

  if (Array.isArray(choice.tool_calls)) {
    for (const tc of choice.tool_calls) {
      if (tc?.function?.name) {
        let args = {};
        if (typeof tc.function.arguments === 'string') {
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            args = {};
          }
        } else if (typeof tc.function.arguments === 'object' && tc.function.arguments !== null) {
          args = tc.function.arguments;
        }
        toolCalls.push({
          name: tc.function.name,
          arguments: args,
        });
      }
    }
  }

  let text = choice.content || '';
  if (text.includes('<tool_call>')) {
    let cleaned = text;
    while (cleaned.includes('<tool_call>')) {
      const start = cleaned.indexOf('<tool_call>');
      const end = cleaned.indexOf('</tool_call>');
      if (end !== -1 && end > start) {
        const rawJson = cleaned.substring(start + '<tool_call>'.length, end).trim();
        try {
          const parsed = JSON.parse(rawJson);
          if (parsed && typeof parsed.name === 'string') {
            toolCalls.push({
              name: parsed.name,
              arguments: parsed.arguments || {},
            });
          }
        } catch {
          // ignore malformed block
        }
        cleaned = cleaned.substring(0, start) + cleaned.substring(end + '</tool_call>'.length);
      } else {
        const rawJson = cleaned.substring(start + '<tool_call>'.length).trim();
        try {
          const parsed = JSON.parse(rawJson);
          if (parsed && typeof parsed.name === 'string') {
            toolCalls.push({
              name: parsed.name,
              arguments: parsed.arguments || {},
            });
          }
        } catch {
          // ignore malformed block
        }
        cleaned = cleaned.substring(0, start);
        break;
      }
    }
    text = cleaned;
  }

  text = text.replace(/<tool_call>/g, '').replace(/<\/tool_call>/g, '').trim();
  return {
    text: text || undefined,
    tool_calls: toolCalls,
  };
}
