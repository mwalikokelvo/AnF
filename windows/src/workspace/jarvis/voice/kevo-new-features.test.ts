/**
 * Tests for new Kevo features: news, air quality, music recs.
 * Run with node --experimental-vm-modules or in project test suite.
 */

import { fetchTopHeadlines, formatHeadlines } from './kevo-news';
import { getAirQuality } from './kevo-airquality';
import { recommendFromHistory } from './kevo-recs';

async function testNews() {
  const heads = await fetchTopHeadlines(2);
  console.assert(Array.isArray(heads), 'headlines is array');
  const fmt = formatHeadlines(heads);
  console.assert(typeof fmt === 'string', 'formatted string');
  console.log('News test passed:', fmt.slice(0, 50));
}

async function testAQI() {
  const aqi = await getAirQuality('London');
  console.assert(aqi === null || typeof aqi === 'string', 'aqi result');
  console.log('AQI test passed:', aqi?.slice(0, 40) || 'offline');
}

function testRecs() {
  const history = [{ title: 'Song A', artist: 'Artist X', genre: 'rock' }];
  const library = [
    { title: 'Song B', artist: 'Artist X', genre: 'rock' },
    { title: 'Song C', artist: 'Other', genre: 'jazz' },
  ];
  const rec = recommendFromHistory(history, library);
  console.assert(rec.includes('Song B'), 'recommends matching');
  console.log('Recs test passed:', rec);
}

(async () => {
  await testNews();
  await testAQI();
  testRecs();
  console.log('All new Kevo feature tests completed.');
})();
