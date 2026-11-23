// Tests for Podcast RSS/OPML and Audio Stream Cache
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePodcastRssXml,
  parseDurationToSeconds,
  exportOpmlSubscriptions,
  parseOpmlSubscriptions,
} from '../src/workspace/media/podcast-rss-feed.js';
import { AudioStreamCache } from '../src/workspace/media/audio-stream-cache.js';

test('Media Suite - AntennaPod-grade Podcast Parser & OPML', async (t) => {
  await t.test('parses duration strings correctly', () => {
    assert.equal(parseDurationToSeconds('01:30:15'), 5415);
    assert.equal(parseDurationToSeconds('15:30'), 930);
    assert.equal(parseDurationToSeconds('45'), 45);
    assert.equal(parseDurationToSeconds(''), 0);
  });

  await t.test('parses podcast RSS with audio enclosure and Podlove chapters', () => {
    const sampleXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:psc="http://podlove.org/simple-chapters">
        <channel>
          <title>Tech Insights</title>
          <link>https://example.com/podcast</link>
          <description>Deep dive into modern tech</description>
          <itunes:author>Jane Doe</itunes:author>
          <item>
            <title>Episode 101: Local AI &amp; Privacy</title>
            <guid>ep-101-guid</guid>
            <pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate>
            <itunes:summary>Discussion on local inference</itunes:summary>
            <itunes:duration>00:45:00</itunes:duration>
            <enclosure url="https://example.com/audio/ep101.mp3" length="43200000" type="audio/mpeg" />
            <psc:chapter start="00:00:00" title="Introduction" />
            <psc:chapter start="00:15:30" title="Quantization Breakdown" />
            <psc:chapter start="00:35:00" title="Conclusion &amp; Q&amp;A" />
          </item>
        </channel>
      </rss>
    `;

    const feed = parsePodcastRssXml(sampleXml);
    assert.equal(feed.title, 'Tech Insights');
    assert.equal(feed.author, 'Jane Doe');
    assert.equal(feed.episodes.length, 1);

    const ep = feed.episodes[0];
    assert.equal(ep.id, 'ep-101-guid');
    assert.equal(ep.title, 'Episode 101: Local AI & Privacy');
    assert.equal(ep.durationSeconds, 2700);
    assert.equal(ep.audioUrl, 'https://example.com/audio/ep101.mp3');
    assert.equal(ep.chapters.length, 3);
    assert.equal(ep.chapters[1].title, 'Quantization Breakdown');
    assert.equal(ep.chapters[1].startSeconds, 930);
  });

  await t.test('exports and imports OPML subscriptions faithfully', () => {
    const subs = [
      { text: 'Tech Insights', title: 'Tech Insights', xmlUrl: 'https://example.com/rss.xml', htmlUrl: 'https://example.com' },
      { text: 'Science Weekly', title: 'Science Weekly', xmlUrl: 'https://science.org/feed.xml' },
    ];

    const opmlXml = exportOpmlSubscriptions(subs, 'My Podcasts');
    assert.ok(opmlXml.includes('<opml version="2.0">'));
    assert.ok(opmlXml.includes('xmlUrl="https://example.com/rss.xml"'));

    const parsed = parseOpmlSubscriptions(opmlXml);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].title, 'Tech Insights');
    assert.equal(parsed[0].xmlUrl, 'https://example.com/rss.xml');
    assert.equal(parsed[1].xmlUrl, 'https://science.org/feed.xml');
  });
});

test('Media Suite - Spotube & ViMusic Audio Stream Cache', async (t) => {
  await t.test('buffers chunks, tracks buffered ranges, and retrieves faithfully', () => {
    const cache = new AudioStreamCache({ maxCacheSizeBytes: 1024 * 1024 });
    const chunk0 = new Uint8Array([1, 2, 3, 4]);
    const chunk1 = new Uint8Array([5, 6, 7, 8]);
    const chunk3 = new Uint8Array([9, 10, 11, 12]);

    cache.putChunk('track-1', 0, chunk0);
    cache.putChunk('track-1', 1, chunk1);
    cache.putChunk('track-1', 3, chunk3);

    assert.equal(cache.hasChunk('track-1', 0), true);
    assert.equal(cache.hasChunk('track-1', 2), false);

    const retrieved = cache.getChunk('track-1', 0);
    assert.deepEqual(retrieved, chunk0);

    const ranges = cache.getTrackBufferedRanges('track-1');
    assert.equal(ranges.length, 2);
    assert.deepEqual(ranges[0], { startChunk: 0, endChunk: 1 });
    assert.deepEqual(ranges[1], { startChunk: 3, endChunk: 3 });
  });

  await t.test('enforces max budget with LRU eviction', () => {
    const cache = new AudioStreamCache({ maxCacheSizeBytes: 10 }); // only 10 bytes budget
    cache.putChunk('track-1', 0, new Uint8Array([1, 2, 3, 4]));
    cache.putChunk('track-1', 1, new Uint8Array([5, 6, 7, 8]));

    // Adding 4 bytes exceeds 10 bytes (4 + 4 + 4 = 12 > 10)
    cache.putChunk('track-1', 2, new Uint8Array([9, 10, 11, 12]));

    // chunk 0 was oldest, should have been evicted
    assert.equal(cache.hasChunk('track-1', 0), false);
    assert.equal(cache.hasChunk('track-1', 1), true);
    assert.equal(cache.hasChunk('track-1', 2), true);
  });
});
