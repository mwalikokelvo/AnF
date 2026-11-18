import { parseCurrencyRequest, formatConversion } from '../src/workspace/jarvis/voice/kevo-currency';

describe('Kevo currency conversion', () => {
  test('parses convert 100 USD to EUR', () => {
    const parsed = parseCurrencyRequest('convert 100 usd to eur');
    expect(parsed).toEqual({ amount: 100, from: 'USD', to: 'EUR' });
  });

  test('parses how much is 50 pounds in dollars', () => {
    const parsed = parseCurrencyRequest('how much is 50 pounds in dollars');
    expect(parsed).toEqual({ amount: 50, from: 'GBP', to: 'USD' });
  });

  test('rejects same currency', () => {
    expect(parseCurrencyRequest('convert 10 usd to usd')).toBeNull();
  });

  test('formats conversion', () => {
    const text = formatConversion({
      amount: 100,
      from: 'USD',
      to: 'EUR',
      result: 92.5,
      date: '2026-11-18',
    });
    expect(text).toContain('100 USD is about 92.5 EUR');
    expect(text).toContain('2026-11-18');
  });
});
