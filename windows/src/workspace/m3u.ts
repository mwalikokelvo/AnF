// Universal M3U / M3U8 Playlist Parser and Generator
// Supports standard extended M3U (#EXTM3U, #EXTINF), attribute tags, stream URLs and local paths.
// Fully offline, zero dependencies, RFC-compliant.

export interface M3uEntry {
  title: string;
  artist?: string;
  duration?: number;
  uri: string;
  group?: string;
  logoUrl?: string;
  isStream: boolean;
}

/** Parses standard or extended M3U / M3U8 playlist text into typed M3uEntry items. */
export function parseM3u(content: string): M3uEntry[] {
  if (typeof content !== 'string') return [];
  const lines = content.split(/\r?\n/).map((l) => l.trim());
  const entries: M3uEntry[] = [];

  let pendingDuration: number | undefined;
  let pendingTitle: string | undefined;
  let pendingArtist: string | undefined;
  let pendingGroup: string | undefined;
  let pendingLogo: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Header tag
    if (line.startsWith('#EXTM3U')) continue;

    // Metadata line: #EXTINF:<duration> [attributes],Title
    if (line.startsWith('#EXTINF:')) {
      const rest = line.slice(8).trim();
      const commaIdx = rest.indexOf(',');

      let infoPart = rest;
      let titlePart = '';
      if (commaIdx !== -1) {
        infoPart = rest.slice(0, commaIdx).trim();
        titlePart = rest.slice(commaIdx + 1).trim();
      }

      // Extract duration (can be integer or float, e.g. 180 or -1 for live streams)
      const durMatch = /^([-+]?\d+(?:\.\d+)?)/.exec(infoPart);
      if (durMatch) {
        const d = parseFloat(durMatch[1]);
        if (d > 0) pendingDuration = Math.round(d);
        else pendingDuration = 0; // Live stream or unknown
      }

      // Check for inline attributes, e.g. tvg-logo="...", group-title="..."
      const logoMatch = /tvg-logo="([^"]+)"/i.exec(infoPart);
      if (logoMatch) pendingLogo = logoMatch[1];

      const groupMatch = /group-title="([^"]+)"/i.exec(infoPart);
      if (groupMatch) pendingGroup = groupMatch[1];

      // Parse title and optional artist: "Artist - Title" or just "Title"
      if (titlePart) {
        const dashIdx = titlePart.indexOf(' - ');
        if (dashIdx !== -1) {
          pendingArtist = titlePart.slice(0, dashIdx).trim();
          pendingTitle = titlePart.slice(dashIdx + 3).trim();
        } else {
          pendingTitle = titlePart;
        }
      }
      continue;
    }

    // Skip other comment or directive lines starting with #
    if (line.startsWith('#')) {
      if (line.startsWith('#EXTGRP:')) {
        pendingGroup = line.slice(8).trim();
      }
      continue;
    }

    // This is the URI line (URL or local file path)
    const uri = line;
    const isStream = /^https?:\/\//i.test(uri);

    // If no title was provided in #EXTINF, derive from URI basename
    let finalTitle = pendingTitle;
    if (!finalTitle) {
      const rawName = uri.split(/[\\/]/).pop() || 'Untitled Track';
      finalTitle = rawName.replace(/\.[a-zA-Z0-9]+$/, '').replace(/[_+]/g, ' ');
    }

    entries.push({
      title: finalTitle,
      artist: pendingArtist,
      duration: pendingDuration,
      uri,
      group: pendingGroup,
      logoUrl: pendingLogo,
      isStream,
    });

    // Reset pending state for next entry
    pendingDuration = undefined;
    pendingTitle = undefined;
    pendingArtist = undefined;
    pendingGroup = undefined;
    pendingLogo = undefined;
  }

  return entries;
}

/** Serializes a playlist of audio tracks or entries into standard #EXTM3U text. */
export function serializeM3u(
  entries: Array<{ title: string; artist?: string; duration?: number; uri: string }>
): string {
  const lines: string[] = ['#EXTM3U'];

  for (const entry of entries) {
    const dur = typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration > 0
      ? Math.round(entry.duration)
      : -1;
    const title = entry.artist ? `${entry.artist} - ${entry.title}` : entry.title;
    lines.push(`#EXTINF:${dur},${title}`);
    lines.push(entry.uri);
  }

  return lines.join('\n') + '\n';
}
