/**
 * Tests for Kevo dictionary formatting (network call mocked or skipped in CI).
 * Full network test would require live API; this checks local formatting.
 */
import { formatDefinition, type DictionaryEntry } from '../src/workspace/jarvis/voice/kevo-dictionary';

describe('kevo dictionary', () => {
  it('formats a definition nicely', () => {
    const entry: DictionaryEntry = {
      word: 'hello',
      phonetic: 'həˈləʊ',
      meanings: [
        {
          partOfSpeech: 'exclamation',
          definitions: [
            { definition: 'used as a greeting.', example: 'hello there' },
          ],
        },
      ],
    };
    const out = formatDefinition(entry);
    expect(out).toContain('hello');
    expect(out).toContain('greeting');
    expect(out).toContain('hello there');
  });

  it('handles missing phonetic', () => {
    const entry: DictionaryEntry = {
      word: 'test',
      meanings: [{ definitions: [{ definition: 'a procedure' }] }],
    };
    const out = formatDefinition(entry);
    expect(out).toContain('test:');
    expect(out).toContain('a procedure');
  });
});
