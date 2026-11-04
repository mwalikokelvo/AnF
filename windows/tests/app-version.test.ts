import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { androidVersionLabel } from '../../android/web/app-version.ts';

const { version } = JSON.parse(readFileSync(new URL('../../android/package.json', import.meta.url), 'utf8')) as { version: string };

test('Android settings heading follows android/package.json', () => {
  assert.equal(androidVersionLabel(), `AnF ${version} · Android`);
});
