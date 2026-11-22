/**
 * Kevo's online lookups (Wikipedia, word definitions, currency rates, translation, trivia) share one switch, off until the owner says
 * "turn on online lookups": each sends what was asked about to a free public service (AGENTS.md: network calls only
 * to services the owner turned on). Weather has its own switch.
 */

export type LookupFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const ONLINE_LOOKUPS_OFF =
  'Online lookups are off. They send what you ask about to free public services: Wikipedia, a dictionary, a currency rate service, a translation service and a trivia quiz. Say turn on online lookups to allow them.';

/** One GET with an 8 second limit. A network failure says plainly that `service` did not answer. */
export async function onlineGet(url: string, service: string, fetchFn?: LookupFetch, headers?: Record<string, string>): Promise<Awaited<ReturnType<LookupFetch>>> {
  const send: LookupFetch = fetchFn ?? ((u, init) => fetch(u, { headers: init?.headers, signal: AbortSignal.timeout(8000) }));
  try {
    return await send(url, headers && { headers });
  } catch {
    throw new Error(`${service} did not answer. Check the internet connection.`);
  }
}

/** "turn on online lookups" is true, "turn off online lookups" false, anything else null. */
export function parseOnlineLookupsSwitch(lower: string): boolean | null {
  const said = lower
    .replace(/[.!?]+$/, '')
    .trim()
    .replace(/^(?:(?:can|could|would|will) you(?: please)?|please)[\s,]+/, '')
    .replace(/[\s,]+please$/, '');
  const m = /^(?:(?:turn|switch) (on|off) (?:the )?online (?:lookups?|answers)|(?:turn|switch) (?:the )?online (?:lookups?|answers) (on|off)|(enable|allow|disable) (?:the )?online (?:lookups?|answers))$/.exec(said);
  if (!m) return null;
  const word = m[1] ?? m[2] ?? m[3];
  return word === 'on' || word === 'enable' || word === 'allow';
}
