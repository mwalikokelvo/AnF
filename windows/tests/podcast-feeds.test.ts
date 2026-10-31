import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRss,
  parseDuration,
  substackFeedUrl,
  updateEpisodePosition,
  markEpisodePlayed,
  getEpisodeState
} from '../src/workspace/podcast-feeds.js';

// Setup minimal localStorage mock for Node test environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; }
  };
}

describe('Podcast Feeds & RSS Parser', () => {
  test('parseDuration handles diverse time expressions', () => {
    assert.equal(parseDuration('120'), 120);
    assert.equal(parseDuration('03:45'), 3 * 60 + 45);
    assert.equal(parseDuration('01:30:15'), 1 * 3600 + 30 * 60 + 15);
    assert.equal(parseDuration('45.7'), 46);
    assert.equal(parseDuration(''), undefined);
    assert.equal(parseDuration('invalid:format:xyz'), undefined);
  });

  test('substackFeedUrl normalizes URLs to /feed endpoint', () => {
    assert.equal(substackFeedUrl('https://example.substack.com'), 'https://example.substack.com/feed');
    assert.equal(substackFeedUrl('https://example.substack.com/feed'), 'https://example.substack.com/feed');
    assert.equal(substackFeedUrl('https://substack.com/@author'), 'https://substack.com/feed');
    assert.equal(substackFeedUrl('https://google.com'), undefined);
  });

  test('episode state updates and retrieves saved progress and played status', () => {
    const epId = 'test-ep-123';
    updateEpisodePosition(epId, 245.5);
    assert.equal(getEpisodeState(epId).position, 245.5);
    assert.equal(getEpisodeState(epId).played, false);

    markEpisodePlayed(epId, true);
    assert.equal(getEpisodeState(epId).played, true);
    assert.equal(getEpisodeState(epId).position, 245.5);
  });

  test('parseRss extracts metadata, duration, and enclosure details', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel>
        <title>Tech Talks</title>
        <image><url>https://example.org/cover.png</url></image>
        <item>
          <guid>tt-101</guid>
          <title>Deep Dive into Offline-First</title>
          <description><![CDATA[<p>Detailed discussion of local sync.</p>]]></description>
          <enclosure url="https://example.org/audio/101.mp3" length="45000000" type="audio/mpeg"/>
          <itunes:duration>45:30</itunes:duration>
          <itunes:episode>101</itunes:episode>
          <itunes:season>2</itunes:season>
          <pubDate>Mon, 26 Oct 2026 12:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

    // Simple polyfill for DOMParser in node test runner if needed
    if (typeof globalThis.DOMParser === 'undefined') {
      globalThis.DOMParser = class {
        parseFromString(str: string) {
          return {
            querySelector: (sel: string) => {
              if (sel === 'channel') return {
                querySelector: (s: string) => {
                  if (s === 'title') return { textContent: 'Tech Talks' };
                  if (s.includes('image')) return { textContent: 'https://example.org/cover.png', getAttribute: () => 'https://example.org/cover.png' };
                  return null;
                }
              };
              return null;
            },
            querySelectorAll: (sel: string) => {
              if (sel === 'item') {
                return [{
                  querySelector: (s: string) => {
                    if (s === 'enclosure') return { getAttribute: (a: string) => a === 'url' ? 'https://example.org/audio/101.mp3' : a === 'length' ? '45000000' : 'audio/mpeg' };
                    if (s === 'guid') return { textContent: 'tt-101' };
                    if (s === 'title') return { textContent: 'Deep Dive into Offline-First' };
                    if (s === 'description') return { textContent: 'Detailed discussion of local sync.' };
                    if (s.includes('duration')) return { textContent: '45:30' };
                    if (s.includes('episode')) return { textContent: '101' };
                    if (s.includes('season')) return { textContent: '2' };
                    if (s === 'pubDate') return { textContent: 'Mon, 26 Oct 2026 12:00:00 GMT' };
                    return null;
                  }
                }];
              }
              return [];
            }
          } as any;
        }
      } as any;
    }

    const feed = parseRss(xml, 'https://example.org/rss');
    assert.equal(feed.title, 'Tech Talks');
    assert.equal(feed.episodes.length, 1);

    const ep = feed.episodes[0];
    assert.equal(ep.id, 'tt-101');
    assert.equal(ep.title, 'Deep Dive into Offline-First');
    assert.equal(ep.duration, 45 * 60 + 30);
    assert.equal(ep.enclosureLength, 45000000);
    assert.equal(ep.enclosureType, 'audio/mpeg');
    assert.equal(ep.episodeNo, 101);
    assert.equal(ep.seasonNo, 2);
  });
});
