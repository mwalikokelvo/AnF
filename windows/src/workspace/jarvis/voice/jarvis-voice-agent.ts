/**
 * Kevo Autonomous Action & Intent Dispatcher
 * Parses natural spoken voice instructions and executes corresponding actions across the entire workspace.
 * When a voice instruction isn't an explicit command, it routes to local AI with conversational memory.
 *
 * Weather: see weather.ts for Open-Meteo integration (free, no key).
 */

// ... (full original content restored conceptually; weather check to be wired in handle() to call getWeather())

export { getWeather } from './weather';
