// Simple node tests for new Kevo weather/news/recommend modules (mock fetch where needed).
'use strict';
const assert = require('node:assert/strict');
const { getWeather } = require('./kevo-weather');
const { getTopNews } = require('./kevo-news');
const { recommendMusic } = require('./kevo-recommend');

// Note: these hit real free APIs in CI; for pure unit, mock global fetch.
// Here we just assert the functions exist and return strings on basic calls (network may fail gracefully).

(async () => {
  const w = await getWeather('London');
  assert(typeof w === 'string' && w.length > 10, 'weather returns a sentence');
  console.log('weather sample:', w.slice(0, 80));

  const n = await getTopNews(3);
  assert(typeof n === 'string' && n.includes('sir'), 'news returns a reply');
  console.log('news sample:', n.slice(0, 80));

  const r = await recommendMusic('Dune');
  assert(typeof r === 'string', 'recommend returns a string');
  console.log('recommend sample:', r.slice(0, 80));

  console.log('kevo new features basic checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
