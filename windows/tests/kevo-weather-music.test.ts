import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatWeather, type WeatherResult } from '../src/workspace/jarvis/voice/kevo-weather';
import { setVolume, volumeUp, toggleShuffle, setRepeat, getNext, getState } from '../src/workspace/jarvis/voice/kevo-music-controls';

describe('Kevo weather and music controls', () => {
  it('formats weather speech correctly', () => {
    const w: WeatherResult = { temperature: 22, windSpeed: 15, weatherCode: 0, description: 'clear sky', location: 'London' };
    assert.ok(formatWeather(w).includes('22'));
    assert.ok(formatWeather(w).includes('clear sky'));
  });

  it('clamps volume between 0 and 100', () => {
    assert.ok(setVolume(150).includes('100'));
    assert.ok(setVolume(-10).includes('0'));
    assert.strictEqual(getState().volume, 0);
  });

  it('toggles shuffle and sets repeat', () => {
    const before = getState().shuffle;
    toggleShuffle();
    assert.notStrictEqual(getState().shuffle, before);
    setRepeat('one');
    assert.strictEqual(getState().repeat, 'one');
  });

  it('reports next when empty', () => {
    assert.ok(getNext().includes('Nothing is queued'));
  });
});
