import { describe, it, expect, vi } from 'vitest';
import { getWeather, formatWeather } from '../src/workspace/jarvis/voice/kevo-weather';
import { addToShoppingList, listShoppingList, clearShoppingList } from '../src/workspace/jarvis/voice/kevo-shopping';

describe('Kevo weather and shopping', () => {
  it('formats weather reply', () => {
    const w = { location: 'Nairobi', temperature: 22, unit: 'C', description: 'partly cloudy' };
    expect(formatWeather(w)).toContain('22 degrees');
    expect(formatWeather(w)).toContain('Nairobi');
  });

  it('manages shopping list', () => {
    clearShoppingList();
    expect(listShoppingList()).toContain('empty');
    expect(addToShoppingList('milk')).toContain('Added milk');
    expect(listShoppingList()).toContain('milk');
    clearShoppingList();
  });
});
