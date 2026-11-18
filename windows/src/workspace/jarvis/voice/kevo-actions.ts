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
 */

import type { JarvisActionContext } from './jarvis-voice-agent';
import { searchAudiusTracks, formatAudiusResults } from './audius-search';
import { rememberFact, listFacts, deleteFact, type KevoFact } from './jarvis-memory';
import {
  createReminder,
  listReminders,
  cancelReminder,
  scheduleDailyBriefing,
  cancelDailyBriefingSchedule,
  getDailyBriefingSchedule,
} from './jarvis-schedule';

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

export interface KevoActionExecutionResult {
  handled: boolean;
  actionName: string;
  speechReply: string;
  data?: unknown;
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
  execute: (args: TArgs, context: JarvisActionContext) => Promise<KevoActionExecutionResult>;
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
        return { handled: false, actionName: 'open_app', speechReply: 'Which app would you like me to open, sir?' };
      }
      if (ctx.openApp) {
        try {
          const opened = ctx.dryRun ? app : await ctx.openApp(app);
          return { handled: true, actionName: 'open_app', speechReply: `Opening ${opened}, sir.` };
        } catch (err) {
          return { handled: true, actionName: 'open_app', speechReply: `I could not open ${app}: ${String(err)}` };
        }
      }
      return { handled: false, actionName: 'open_app', speechReply: 'App launching is not supported in this environment.' };
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
        return { handled: false, actionName: 'open_site', speechReply: 'Which site would you like to visit, sir?' };
      }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      if (ctx.openUrl) {
        if (!ctx.dryRun) await ctx.openUrl(url);
        return { handled: true, actionName: 'open_site', speechReply: `Opening ${url}, sir.` };
      }
      return { handled: false, actionName: 'open_site', speechReply: 'Opening websites is not supported.' };
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
        return { handled: false, actionName: 'youtube_search', speechReply: 'What would you like me to search on YouTube, sir?' };
      }
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
      if (ctx.openUrl) {
        if (!ctx.dryRun) await ctx.openUrl(url);
        return { handled: true, actionName: 'youtube_search', speechReply: `Searching YouTube for ${q}, sir.` };
      }
      return { handled: false, actionName: 'youtube_search', speechReply: 'YouTube search is not supported.' };
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
        return { handled: false, actionName: 'web_search', speechReply: 'What would you like me to search for, sir?' };
      }
      if (ctx.searchWeb) {
        if (!ctx.dryRun) await ctx.searchWeb(q);
        return { handled: true, actionName: 'web_search', speechReply: `Searching the web for ${q}, sir.` };
      }
      return { handled: false, actionName: 'web_search', speechReply: 'Web search is not supported.' };
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
        if (!ctx.dryRun) await ctx.searchMusic(q);
        return { handled: true, actionName: 'music_play', speechReply: `Playing ${q}, sir.` };
      }
      if (ctx.playMusic) {
        if (!ctx.dryRun) ctx.playMusic();
        return { handled: true, actionName: 'music_play', speechReply: 'Resuming playback, sir.' };
      }
      return { handled: false, actionName: 'music_play', speechReply: 'Music playback is not supported.' };
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
        if (!ctx.dryRun) ctx.pauseMusic();
        return { handled: true, actionName: 'music_pause', speechReply: 'Playback paused, sir.' };
      }
      return { handled: false, actionName: 'music_pause', speechReply: 'Music pause is not supported.' };
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
        if (!ctx.dryRun) ctx.nextTrack();
        return { handled: true, actionName: 'next_track', speechReply: 'Skipping to next track, sir.' };
      }
      return { handled: false, actionName: 'next_track', speechReply: 'Skipping tracks is not supported.' };
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
        return { handled: false, actionName: 'timer_set', speechReply: 'Please specify a valid timer duration in seconds, sir.' };
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
        return { handled: true, actionName: 'timer_set', speechReply: `Timer set for ${desc}, sir.` };
      }
      return { handled: false, actionName: 'timer_set', speechReply: 'Timers are not supported.' };
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
        return { handled: false, actionName: 'take_note', speechReply: 'What note would you like me to take, sir?' };
      }
      if (ctx.saveQuickNote) {
        if (!ctx.dryRun) await ctx.saveQuickNote(txt);
        return { handled: true, actionName: 'take_note', speechReply: 'Note saved to your vault, sir.' };
      }
      return { handled: false, actionName: 'take_note', speechReply: 'Saving notes is not supported.' };
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
        return { handled: false, actionName: 'search_notes', speechReply: 'What notes should I search for, sir?' };
      }
      if (ctx.searchVault) {
        const res = await ctx.searchVault(q);
        return { handled: true, actionName: 'search_notes', speechReply: res || `No notes found matching "${q}", sir.` };
      }
      return { handled: false, actionName: 'search_notes', speechReply: 'Vault search is not supported.' };
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
          return { handled: true, actionName: 'change_voice', speechReply: `I couldn't find a voice named ${args?.name}, sir.` };
        }
        return { handled: true, actionName: 'change_voice', speechReply: `Voice changed to ${res}, sir.` };
      }
      return { handled: false, actionName: 'change_voice', speechReply: 'Changing voices is not supported.' };
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
        return { handled: true, actionName: 'list_voices', speechReply: `Available voices are: ${voices.join(', ')}.` };
      }
      return { handled: false, actionName: 'list_voices', speechReply: 'Voice listing is not supported.' };
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
      return { handled: true, actionName: 'switch_view', speechReply: `Switched view to ${v}, sir.` };
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
        return { handled: true, actionName: 'briefing', speechReply: b || 'All systems are operating normally, sir.' };
      }
      return { handled: true, actionName: 'briefing', speechReply: 'Good morning, sir. All systems nominal.' };
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
      return { handled: true, actionName: 'tell_time', speechReply: `It is ${time}, sir.` };
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
      return { handled: true, actionName: 'tell_date', speechReply: `Today is ${date}, sir.` };
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
        return { handled: false, actionName: 'audius_search', speechReply: 'What track should I search on Audius, sir?' };
      }
      const results = await searchAudiusTracks(q, 5);
      const reply = formatAudiusResults(results);
      return { handled: true, actionName: 'audius_search', speechReply: reply, data: results };
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
        return { handled: false, actionName: 'remember_fact', speechReply: 'What would you like me to remember, sir?' };
      }
      try {
        if (ctx.rememberFact) {
          await ctx.rememberFact(clean, args?.category);
        } else {
          await rememberFact(clean, args?.category);
        }
        return {
          handled: true,
          actionName: 'remember_fact',
          speechReply: `I will remember that: ${clean}`,
        };
      } catch (err) {
        return {
          handled: false,
          actionName: 'remember_fact',
          speechReply: `Failed to remember: ${String(err)}`,
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
            data: [],
          };
        }
        const bulletPoints = facts.slice(-10).map((f: any) => f.fact).join('. ');
        return {
          handled: true,
          actionName: 'recall_facts',
          speechReply: `Here is what I remember: ${bulletPoints}.`,
          data: facts,
        };
      } catch (err) {
        return {
          handled: false,
          actionName: 'recall_facts',
          speechReply: `Could not retrieve memories: ${String(err)}`,
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
          return {
            handled: true,
            actionName: 'forget_fact',
            speechReply: ok ? 'I have forgotten that, sir.' : 'Could not find that memory to forget.',
          };
        }
        const q = (args?.query || '').trim();
        if (!q) {
          return {
            handled: false,
            actionName: 'forget_fact',
            speechReply: 'What would you like me to forget, sir?',
          };
        }
        const matching = ctx.listFacts ? await ctx.listFacts(q) : await listFacts(q);
        if (!matching || matching.length === 0) {
          return {
            handled: true,
            actionName: 'forget_fact',
            speechReply: `I couldn't find any remembered facts about ${q}, sir.`,
          };
        }
        for (const item of matching) {
          const id = (item as any).id;
          if (id) {
            if (ctx.deleteFact) await ctx.deleteFact(id);
            else await deleteFact(id);
          }
        }
        return {
          handled: true,
          actionName: 'forget_fact',
          speechReply: `I have forgotten that: ${(matching[0] as any).fact}`,
        };
      } catch (err) {
        return {
          handled: false,
          actionName: 'forget_fact',
          speechReply: `Failed to forget memory: ${String(err)}`,
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
        return { handled: false, actionName: 'create_reminder', speechReply: 'What would you like to be reminded about, sir?' };
      }
      try {
        const delay = typeof args?.delay_seconds === 'number' && args.delay_seconds > 0 ? args.delay_seconds * 1000 : 60000;
        const triggerAt = Date.now() + delay;
        if (ctx.createReminder) {
          await ctx.createReminder(clean, triggerAt, args?.recurring);
        } else {
          await createReminder(clean, triggerAt, args?.recurring);
        }
        const delayMin = Math.round(delay / 60000);
        const timeDesc = delayMin >= 1 ? `in ${delayMin} minute${delayMin === 1 ? '' : 's'}` : 'shortly';
        return {
          handled: true,
          actionName: 'create_reminder',
          speechReply: `Reminder set for ${clean} ${timeDesc}, sir.`,
        };
      } catch (err) {
        return {
          handled: false,
          actionName: 'create_reminder',
          speechReply: `Failed to set reminder: ${String(err)}`,
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
            data: [],
          };
        }
        const summary = reminders.slice(-5).map((r: any) => r.message).join(', ');
        return {
          handled: true,
          actionName: 'list_reminders',
          speechReply: `You have ${reminders.length === 1 ? 'one upcoming reminder' : `${reminders.length} upcoming reminders`}: ${summary}.`,
          data: reminders,
        };
      } catch (err) {
        return {
          handled: false,
          actionName: 'list_reminders',
          speechReply: `Failed to retrieve reminders: ${String(err)}`,
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
          return { handled: false, actionName: 'cancel_reminder', speechReply: 'Which reminder would you like to cancel, sir?' };
        }
        const ok = ctx.cancelReminder ? await ctx.cancelReminder(target) : await cancelReminder(target);
        return {
          handled: true,
          actionName: 'cancel_reminder',
          speechReply: ok ? `Cancelled reminder for ${target}, sir.` : `Could not find a reminder matching ${target}, sir.`,
        };
      } catch (err) {
        return {
          handled: false,
          actionName: 'cancel_reminder',
          speechReply: `Failed to cancel reminder: ${String(err)}`,
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
          };
        }
        return {
          handled: true,
          actionName: 'schedule_briefing',
          speechReply: 'No daily briefing is currently scheduled, sir.',
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
        };
      } catch (err: any) {
        return {
          handled: false,
          actionName: 'schedule_briefing',
          speechReply: `Could not schedule daily briefing: ${err?.message || 'invalid time'}.`,
        };
      }
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

export function getKevoSystemPrompt(facts?: KevoFact[]): string {
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
    };
  }
  return action.execute(args, context);
}

export interface KevoToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface KevoAskReply {
  text?: string;
  tool_calls?: KevoToolCall[];
}

/** Executes a sequence of tool calls in order against a JarvisActionContext. */
export async function executeKevoToolCalls(
  toolCalls: KevoToolCall[],
  context: JarvisActionContext,
  onPart?: (text: string) => void
): Promise<KevoActionExecutionResult> {
  const replies: string[] = [];
  const actionNames: string[] = [];
  let allHandled = true;

  for (const call of toolCalls) {
    const res = await executeKevoAction(call.name, call.arguments, context);
    if (!res.handled) allHandled = false;
    actionNames.push(res.actionName || call.name);
    if (res.speechReply) {
      replies.push(res.speechReply);
      onPart?.(res.speechReply);
    }
  }

  return {
    handled: allHandled && toolCalls.length > 0,
    actionName: actionNames.join('+'),
    speechReply: replies.join(' '),
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
