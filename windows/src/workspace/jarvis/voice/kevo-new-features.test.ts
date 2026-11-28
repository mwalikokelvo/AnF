/**
 * Tests for the three new Kevo capabilities.
 * Run with node --experimental-vm-modules or your existing test runner.
 */

import { getWeather, formatWeatherSpeech } from './kevo-weather';
import { lookupFreeDictionary } from './kevo-free-dictionary';
import { recommendLocal, formatRecommendations } from './kevo-local-recs';

async function run() {
  console.log('=== Weather test ===');
  const w = await getWeather('London');
  console.log(formatWeatherSpeech(w, 'London'));

  console.log('\n=== Dictionary test ===');
  const d = await lookupFreeDictionary('serendipity');
  console.log(d?.speech || 'lookup failed');

  console.log('\n=== Local recs test ===');
  const sample: any[] = [
    { id: '1', title: 'Bohemian Rhapsody', artist: 'Queen', genre: 'rock', playCount: 5 },
    { id: '2', title: 'Another One Bites the Dust', artist: 'Queen', genre: 'rock', playCount: 3 },
    { id: '3', title: 'Billie Jean', artist: 'Michael Jackson', genre: 'pop', playCount: 2 },
  ];
  const recs = recommendLocal(sample, 'queen');
  console.log(formatRecommendations(recs));
  console.log('All tests executed (network-dependent for first two).');
}

run().catch(console.error);
