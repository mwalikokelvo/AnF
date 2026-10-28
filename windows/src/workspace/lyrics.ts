// Offline lyrics: LRC files the user imports, or lyrics embedded in the audio file. Nothing is fetched.
export type LyricLine = {time?:number; text:string};
export type Lyrics = {synced:boolean; lines:LyricLine[]};

const MAX_TEXT = 200_000, MAX_LINES = 5000;
const TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** Parses LRC (`[mm:ss.xx] line`, several stamps per line, `[offset:±ms]`) or plain text. */
export function parseLyrics(source:string):Lyrics {
  const text = source.slice(0, MAX_TEXT).replace(/^﻿/, '');
  const offsetMatch = text.match(/^\s*\[offset:\s*([+-]?\d+)\s*\]/im);
  const offset = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const timed:LyricLine[] = [], plain:LyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*\[(ar|ti|al|au|by|length|offset|re|ve|#):/i.test(raw)) continue;
    const stamps:number[] = [];
    TAG.lastIndex = 0;
    let rest = raw, m:RegExpExecArray|null;
    while ((m = TAG.exec(raw))) {
      const fraction = m[3] ? Number(m[3]) / 10 ** m[3].length : 0;
      stamps.push(Number(m[1]) * 60 + Number(m[2]) + fraction);
      rest = raw.slice(TAG.lastIndex);
    }
    const line = rest.replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '').trim();
    // LRC positive offsets advance lyrics (also used by FFmpeg's lrc demuxer).
    if (stamps.length) for (const t of stamps) timed.push({time:Math.max(0, t - offset), text:line});
    else if (line) plain.push({text:line});
  }
  if (timed.length) return {synced:true, lines:timed.sort((a,b)=>a.time!-b.time!).slice(0, MAX_LINES)};
  return {synced:false, lines:plain.slice(0, MAX_LINES)};
}

/** Index of the line being sung at `time`, or -1 before the first line. */
export function activeLine(lyrics:Lyrics, time:number):number {
  if (!lyrics.synced) return -1;
  let lo = 0, hi = lyrics.lines.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lyrics.lines[mid].time! <= time) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/** Turns embedded synchronized lyrics (milliseconds) into LRC text so every source is stored the same way. */
export function toLrc(lines:{text:string; timestamp?:number}[]):string {
  const stamp = (ms:number) => {
    const s = Math.max(0, ms) / 1000, m = Math.floor(s / 60), r = s - m * 60;
    return `[${String(m).padStart(2,'0')}:${r.toFixed(2).padStart(5,'0')}]`;
  };
  return lines.map(l => (l.timestamp !== undefined ? stamp(l.timestamp) : '') + l.text.trim()).join('\n');
}

/** Lower-cased file name without its extension, used to pair `song.lrc` with `song.mp3`. */
export function baseName(name:string):string {
  return name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim().toLocaleLowerCase();
}

type LyricTrack = {id:string;name:string;importPath?:string};
const pathStem = (name:string) => name.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\.[^/.]+$/, '').normalize('NFC').toLowerCase();

/** Prefer the matching folder; never guess when more than one song shares a name. */
export function matchLyricsTrack<T extends LyricTrack>(file:{name:string;webkitRelativePath?:string}, tracks:T[], importedIds:ReadonlySet<string> = new Set()):T|undefined {
  const unique = [...new Map(tracks.map(t => [t.id,t])).values()];
  if (file.webkitRelativePath) {
    const samePath = unique.filter(t => t.importPath && pathStem(t.importPath) === pathStem(file.webkitRelativePath!));
    const justImported = samePath.filter(t => importedIds.has(t.id));
    if (justImported.length) return justImported.length === 1 ? justImported[0] : undefined;
    if (samePath.length) return samePath.length === 1 ? samePath[0] : undefined;
  }
  const sameName = unique.filter(t => baseName(t.name) === baseName(file.name));
  return sameName.length === 1 ? sameName[0] : undefined;
}
