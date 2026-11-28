/**
 * Tests derived from recovered public API rules.
 */
import { formatWeather, formatNews } from './kevo-weather';
import { formatNews as formatN } from './kevo-news';

describe('Kevo weather and news', () => {
  test('formats weather', () => {
    expect(formatWeather({ location: 'London', tempC: 15, condition: 'cloudy', rainChance: 20 })).toContain('15 degrees');
  });
  test('formats news', () => {
    expect(formatN(['Headline one', 'Headline two'])).toContain('Headline one');
  });
});
