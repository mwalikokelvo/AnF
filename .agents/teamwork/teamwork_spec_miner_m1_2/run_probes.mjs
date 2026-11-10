import assert from 'node:assert/strict';
import { parseLyrics, activeLine, toLrc, baseName, matchLyricsTrack } from './dist/lyrics.js';
import { cleanTitle, primaryArtist } from './dist/lyrics-provider.js';

console.log('=== STARTING SPECIFICATION MINING PROBES ===\n');

const observations = [];
function record(category, feature, input, behavior, issue = null) {
  observations.push({ category, feature, input, behavior, issue });
  console.log(`[${category}] ${feature}`);
  console.log(`  Input:    ${JSON.stringify(input)}`);
  console.log(`  Behavior: ${JSON.stringify(behavior)}`);
  if (issue) console.log(`  Note/Gap: ${issue}`);
  console.log('');
}

// 1. cleanTitle Probes
record('cleanTitle', 'Standard video/audio tags', 'Midnight City (Official Video)', cleanTitle('Midnight City (Official Video)'));
record('cleanTitle', 'Square brackets format tag', 'Starboy [Audio]', cleanTitle('Starboy [Audio]'));
record('cleanTitle', 'Live acoustic version', 'Blinding Lights (Live Acoustic Version)', cleanTitle('Blinding Lights (Live Acoustic Version)'));
record('cleanTitle', 'Japanese fullwidth brackets', 'Theme Song 【Official MV】', cleanTitle('Theme Song 【Official MV】'));
record('cleanTitle', 'Pipe separator', 'Track Title | Visualizer HD', cleanTitle('Track Title | Visualizer HD'));
record('cleanTitle', 'Hyphen suffix tag', 'Song Name - Official Music Video', cleanTitle('Song Name - Official Music Video'));
record('cleanTitle', 'Featured artist in parens', 'Stay (feat. Justin Bieber)', cleanTitle('Stay (feat. Justin Bieber)'));
record('cleanTitle', 'Featured artist ft. in parens', 'Levitating (ft. DaBaby)', cleanTitle('Levitating (ft. DaBaby)'));
record('cleanTitle', 'Featured artist bare feat.', 'Song feat. Someone', cleanTitle('Song feat. Someone'));
record('cleanTitle', 'Bare ft. tag', 'Track ft. Guest', cleanTitle('Track ft. Guest'));

// Edge cases for cleanTitle
record('cleanTitle', 'Trailing hyphen left after tag strip', 'Song Name - (Official Video)', cleanTitle('Song Name - (Official Video)'), 'Leaves trailing hyphen');
record('cleanTitle', 'With artist tag (with Singer)', 'Song Name (with Singer)', cleanTitle('Song Name (with Singer)'), 'Not stripped: "with" missing from regex');
record('cleanTitle', 'Only promotional tags (all stripped)', '[Official Audio]', cleanTitle('[Official Audio]'), 'Falls back to original string');
record('cleanTitle', 'Remastered with year in parens', 'Something (2021 Remaster)', cleanTitle('Something (2021 Remaster)'));
record('cleanTitle', '4K 60fps tags', 'Title [4K 60FPS]', cleanTitle('Title [4K 60FPS]'));
record('cleanTitle', 'Empty string', '', cleanTitle(''));
record('cleanTitle', 'Whitespace only', '   ', cleanTitle('   '));

// 2. primaryArtist Probes
record('primaryArtist', 'feat. separator', 'The Weeknd feat. Daft Punk', primaryArtist('The Weeknd feat. Daft Punk'));
record('primaryArtist', 'ampersand separator', 'Calvin Harris & Dua Lipa', primaryArtist('Calvin Harris & Dua Lipa'));
record('primaryArtist', 'and separator', 'Queen and David Bowie', primaryArtist('Queen and David Bowie'));
record('primaryArtist', 'comma separator', 'Kendrick Lamar, SZA', primaryArtist('Kendrick Lamar, SZA'));
record('primaryArtist', 'with separator', 'Silk Sonic with Thundercat', primaryArtist('Silk Sonic with Thundercat'));
record('primaryArtist', 'x separator', 'Marshmello x Bastille', primaryArtist('Marshmello x Bastille'));
record('primaryArtist', 'Multi-artist precedence order flaw', 'Drake, 21 Savage ft. Project Pat', primaryArtist('Drake, 21 Savage ft. Project Pat'), 'FAILED: returns "Drake, 21 Savage" instead of "Drake" because ft. precedes comma in search order');
record('primaryArtist', 'Multi-artist with slash (ID3 standard)', 'Artist A / Artist B', primaryArtist('Artist A / Artist B'), 'Not split: slash not in artistSeparators');
record('primaryArtist', 'Multi-artist with semicolon', 'Artist A; Artist B', primaryArtist('Artist A; Artist B'), 'Not split: semicolon not in artistSeparators');
record('primaryArtist', 'Band with comma in official name', 'Earth, Wind & Fire', primaryArtist('Earth, Wind & Fire'), 'Splits at "Earth" because comma is a separator');

// 3. parseLyrics Probes
record('parseLyrics', 'Standard LRC', '[00:12.50]Hello world', parseLyrics('[00:12.50]Hello world'));
record('parseLyrics', 'Multiple timestamps', '[00:05.00][01:00.00]Chorus', parseLyrics('[00:05.00][01:00.00]Chorus'));
record('parseLyrics', 'Word-by-word timing degraded to line', '[00:20.123]<00:20.20>Word <00:21.00>timed', parseLyrics('[00:20.123]<00:20.20>Word <00:21.00>timed'));
record('parseLyrics', '3-digit minutes (podcast/symphony)', '[125:40.00]Deep into audio', parseLyrics('[125:40.00]Deep into audio'));
record('parseLyrics', 'Colon as millisecond delimiter', '[01:23:45]Colon fraction', parseLyrics('[01:23:45]Colon fraction'));
record('parseLyrics', '3-digit millisecond fraction', '[00:10.123]High precision', parseLyrics('[00:10.123]High precision'));
record('parseLyrics', '1-digit fraction [00:10.5]', '[00:10.5]Single digit', parseLyrics('[00:10.5]Single digit'));
record('parseLyrics', 'Invalid seconds >= 60 rejected', '[00:99.00]Invalid\n[00:10.00]Valid', parseLyrics('[00:99.00]Invalid\n[00:10.00]Valid'));
record('parseLyrics', 'Positive offset advances lyrics', '[offset:+500]\n[00:10.00]Line', parseLyrics('[offset:+500]\n[00:10.00]Line'));
record('parseLyrics', 'Negative offset delays lyrics', '[offset:-500]\n[00:10.00]Line', parseLyrics('[offset:-500]\n[00:10.00]Line'));
record('parseLyrics', 'Offset exceeding timestamp clamped to 0', '[offset:+15000]\n[00:10.00]Line', parseLyrics('[offset:+15000]\n[00:10.00]Line'));
record('parseLyrics', 'LRC metadata headers skipped', '[ti:Title]\n[ar:Artist]\n[al:Album]\n[length:03:00]\n[00:05.00]Line', parseLyrics('[ti:Title]\n[ar:Artist]\n[al:Album]\n[length:03:00]\n[00:05.00]Line'));
record('parseLyrics', 'Empty lines in LRC (instrumental break)', '[00:10.00]\n[00:20.00]Next', parseLyrics('[00:10.00]\n[00:20.00]Next'));
record('parseLyrics', 'Plain text without timestamps', 'Verse 1\nVerse 2\nVerse 3', parseLyrics('Verse 1\nVerse 2\nVerse 3'));
record('parseLyrics', 'Empty string', '', parseLyrics(''));
record('parseLyrics', 'BOM character at start', '\uFEFF[00:05.00]With BOM', parseLyrics('\uFEFF[00:05.00]With BOM'));
record('parseLyrics', 'Max lines limit (5000)', 'Lines exceeding 5000 capped', { linesLength: parseLyrics('[00:01.00]A\n'.repeat(6000)).lines.length });
record('parseLyrics', 'Max text length (200,000)', 'String slice at 200k', { textLength: 'a'.repeat(250000).length });

// 4. activeLine Probes
const sampleLyrics = parseLyrics('[00:05.00]Line 1\n[00:12.50]Line 2\n[00:30.00]Line 3');
record('activeLine', 'Before first line (time = 0)', 0, activeLine(sampleLyrics, 0));
record('activeLine', 'At exact line 0 time (time = 5.0)', 5.0, activeLine(sampleLyrics, 5.0));
record('activeLine', 'Between line 0 and line 1 (time = 8.0)', 8.0, activeLine(sampleLyrics, 8.0));
record('activeLine', 'At exact line 1 time (time = 12.5)', 12.5, activeLine(sampleLyrics, 12.5));
record('activeLine', 'Past all lines (time = 100.0)', 100.0, activeLine(sampleLyrics, 100.0));
record('activeLine', 'Unsynced lyrics', 10.0, activeLine({ synced: false, lines: [{ text: 'A' }] }, 10.0));
record('activeLine', 'Empty synced lyrics', 10.0, activeLine({ synced: true, lines: [] }, 10.0));

// 5. toLrc Probes
record('toLrc', 'Standard millisecond timestamps', [{ text: 'Verse', timestamp: 65250 }, { text: 'Plain' }], toLrc([{ text: 'Verse', timestamp: 65250 }, { text: 'Plain' }]));
record('toLrc', 'Zero timestamp', [{ text: 'Start', timestamp: 0 }], toLrc([{ text: 'Start', timestamp: 0 }]));
record('toLrc', 'Roundtrip toLrc -> parseLyrics', [{ text: 'A', timestamp: 10000 }, { text: 'B', timestamp: 25000 }], parseLyrics(toLrc([{ text: 'A', timestamp: 10000 }, { text: 'B', timestamp: 25000 }])));

// 6. matchLyricsTrack Probes
const trackA = { id: 't1', name: 'Song.mp3', importPath: 'Music/Album 1/Song.mp3' };
const trackB = { id: 't2', name: 'Song.mp3', importPath: 'Music/Album 2/Song.mp3' };
record('matchLyricsTrack', 'Folder match by webkitRelativePath', 'Music/Album 1/Song.lrc', matchLyricsTrack({ name: 'Song.lrc', webkitRelativePath: 'Music/Album 1/Song.lrc' }, [trackA, trackB])?.id);
record('matchLyricsTrack', 'Ambiguous baseName without path', 'Song.lrc', matchLyricsTrack({ name: 'Song.lrc' }, [trackA, trackB]), 'Returns undefined (does not guess)');
record('matchLyricsTrack', 'Unique baseName match', 'Unique.lrc', matchLyricsTrack({ name: 'Unique.lrc' }, [{ id: 'u1', name: 'Unique.flac' }])?.id);

console.log('=== PROBES COMPLETE: ' + observations.length + ' tests executed ===');
