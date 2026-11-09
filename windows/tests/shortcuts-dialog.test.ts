import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_SHORTCUTS,
  isInputFocused,
} from '../src/workspace/shortcuts-dialog';

test('APP_SHORTCUTS defines all major app domains', () => {
  const categoryNames = APP_SHORTCUTS.map((c) => c.category);
  assert.ok(categoryNames.some((c) => c.includes('Global')));
  assert.ok(categoryNames.some((c) => c.includes('Audio') || c.includes('Music')));
  assert.ok(categoryNames.some((c) => c.includes('Reader')));
  assert.ok(categoryNames.some((c) => c.includes('Writing')));

  for (const cat of APP_SHORTCUTS) {
    assert.ok(cat.items.length > 0, `${cat.category} has items`);
    for (const item of cat.items) {
      assert.ok(item.keys.length > 0, `${item.description} has keys`);
      assert.ok(item.description.trim().length > 0);
    }
  }
});

test('isInputFocused identifies input and textarea elements safely', () => {
  assert.equal(isInputFocused(null), false);
  assert.equal(isInputFocused({} as any), false);

  const mockDiv = { tagName: 'DIV', isContentEditable: false } as any;
  assert.equal(isInputFocused(mockDiv), false);

  const mockInput = { tagName: 'INPUT', isContentEditable: false } as any;
  assert.equal(isInputFocused(mockInput), true);

  const mockTextarea = { tagName: 'TEXTAREA', isContentEditable: false } as any;
  assert.equal(isInputFocused(mockTextarea), true);

  const mockSelect = { tagName: 'SELECT', isContentEditable: false } as any;
  assert.equal(isInputFocused(mockSelect), true);

  const mockEditable = { tagName: 'DIV', isContentEditable: true } as any;
  assert.equal(isInputFocused(mockEditable), true);
});
