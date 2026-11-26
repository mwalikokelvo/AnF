// Minimal tests for new Kevo helpers (run with node)
const assert = require('assert');
const { isNewsRequest } = require('../windows/src/workspace/jarvis/voice/kevo-news.ts'); // note: may need ts-node or compile in real CI

// Since these are TS, this is a sketch; real tests live in the project's test suite.
assert.strictEqual(isNewsRequest("what's the news"), true);
assert.strictEqual(isNewsRequest("weather in Paris"), false);
console.log('News request detector: ok');
