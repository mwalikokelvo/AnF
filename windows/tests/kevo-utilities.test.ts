import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convertTemperature, parseConvertRequest, convertUnit } from '../src/workspace/jarvis/voice/kevo-units';
import { parseCurrencyRequest } from '../src/workspace/jarvis/voice/kevo-currency';
import { isNewsRequest, formatHeadlines } from '../src/workspace/jarvis/voice/kevo-news';

describe('kevo units', () => {
  it('converts temperature', () => {
    assert.equal(convertTemperature(32, 'f', 'c'), 0);
    assert.equal(Math.round(convertTemperature(100, 'c', 'f')), 212);
  });
  it('parses convert requests', () => {
    const p = parseConvertRequest('convert 100 f to c');
    assert.equal(p?.category, 'temp');
    assert.equal(p?.value, 100);
  });
  it('converts length', () => {
    assert.ok(Math.abs((convertUnit(1, 'mi', 'km', 'length') ?? 0) - 1.609) < 0.01);
  });
});

describe('kevo currency', () => {
  it('parses currency request', () => {
    const p = parseCurrencyRequest('convert 100 usd to eur');
    assert.equal(p?.amount, 100);
    assert.equal(p?.from, 'usd');
  });
});

describe('kevo news', () => {
  it('detects news request', () => {
    assert.equal(isNewsRequest('tell me the news'), true);
    assert.equal(isNewsRequest('what is the time'), false);
  });
  it('formats headlines', () => {
    const s = formatHeadlines(['One', 'Two']);
    assert.match(s, /1\. One/);
  });
});
