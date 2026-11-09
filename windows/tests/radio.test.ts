import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRadioStations,
  searchRadioStations,
  getTopRadioStations,
  getRadioStationsByTag,
  radioPaceGate,
  RADIO_BROWSER_MIRRORS,
  type RadioStation,
} from '../src/workspace/radio';

test('parseRadioStations parses valid station records and filters bad data', () => {
  const sample = [
    {
      stationuuid: 'uuid-1',
      name: 'SomaFM Groove Salad',
      url_resolved: 'https://ice1.somafm.com/groovesalad-128-mp3',
      homepage: 'https://somafm.com',
      favicon: 'https://somafm.com/favicon.ico',
      country: 'United States',
      countrycode: 'US',
      tags: 'ambient, chillout, downtempo',
      bitrate: 128,
      codec: 'mp3',
      votes: 1200,
    },
    {
      // Duplicate uuid
      stationuuid: 'uuid-1',
      name: 'Duplicate',
      url: 'https://example.com/stream',
    },
    {
      // Invalid stream URL (javascript protocol)
      stationuuid: 'uuid-2',
      name: 'Malicious',
      url: 'javascript:alert(1)',
    },
    {
      // Missing name
      stationuuid: 'uuid-3',
      name: '',
      url: 'https://stream.example.com',
    },
    null,
    'not an object',
  ];

  const parsed = parseRadioStations(sample);
  assert.equal(parsed.length, 1);
  const st = parsed[0];
  assert.equal(st.id, 'radio:uuid-1');
  assert.equal(st.name, 'SomaFM Groove Salad');
  assert.equal(st.streamUrl, 'https://ice1.somafm.com/groovesalad-128-mp3');
  assert.equal(st.country, 'United States');
  assert.equal(st.countrycode, 'US');
  assert.deepEqual(st.tags, ['ambient', 'chillout', 'downtempo']);
  assert.equal(st.bitrate, 128);
  assert.equal(st.codec, 'MP3');
  assert.equal(st.votes, 1200);
});

test('searchRadioStations returns empty array for empty or whitespace query', async () => {
  let called = false;
  const mockFetch = async () => {
    called = true;
    return new Response('[]');
  };
  const results = await searchRadioStations('   ', 10, mockFetch as any);
  assert.deepEqual(results, []);
  assert.equal(called, false);
});

test('searchRadioStations queries mirror and returns parsed stations', async () => {
  const fakeResponse = [
    {
      stationuuid: 'uuid-lofi-1',
      name: 'Lofi Hip Hop Radio',
      url_resolved: 'https://stream.lofi.example/live',
      tags: 'lofi, hiphop, study',
      bitrate: 192,
      codec: 'mp3',
    },
  ];

  let requestedUrl = '';
  const mockFetch = async (url: string) => {
    requestedUrl = url;
    return new Response(JSON.stringify(fakeResponse), { status: 200 });
  };

  const results = await searchRadioStations('lofi', 10, mockFetch as any);
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Lofi Hip Hop Radio');
  assert.equal(results[0].streamUrl, 'https://stream.lofi.example/live');
  assert.match(requestedUrl, /search\?name=lofi/);
});

test('queryRadioMirrors fails over when first mirror errors', async () => {
  const mirror1 = RADIO_BROWSER_MIRRORS[0];
  const mirror2 = RADIO_BROWSER_MIRRORS[1];

  let attempt = 0;
  const mockFetch = async (url: string) => {
    attempt++;
    if (url.startsWith(mirror1)) {
      return new Response('Internal Server Error', { status: 503 });
    }
    return new Response(JSON.stringify([
      {
        stationuuid: 'uuid-jazz-1',
        name: 'Cool Jazz FM',
        url_resolved: 'https://stream.jazz.example/live',
        tags: 'jazz',
      },
    ]), { status: 200 });
  };

  const results = await getRadioStationsByTag('jazz', 10, mockFetch as any);
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Cool Jazz FM');
  assert.equal(attempt, 2);
  assert.equal(radioPaceGate.isCoolingDown(mirror1), true);
});
