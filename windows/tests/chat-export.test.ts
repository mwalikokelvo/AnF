import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeChatToMarkdown, serializeChatToHtml } from '../src/workspace/chat-export';

test('serializeChatToMarkdown produces formatted markdown with sources and turns', () => {
  const history = [
    { role: 'user' as const, content: [{ text: 'What is WebAudio?' }] },
    { role: 'assistant' as const, content: [{ text: 'WebAudio is a high-level Web API for audio synthesis.' }] },
  ];
  const sources = [{ name: 'MDN Web Audio API.pdf' }];

  const md = serializeChatToMarkdown('Audio Research', history, sources);

  assert.match(md, /^# Audio Research/);
  assert.match(md, /## Active Sources/);
  assert.match(md, /- \*\*MDN Web Audio API\.pdf\*\*/);
  assert.match(md, /### 👤 \*\*User\*\*/);
  assert.match(md, /What is WebAudio\?/);
  assert.match(md, /### 🤖 \*\*AnF Local AI\*\*/);
  assert.match(md, /WebAudio is a high-level Web API/);
});

test('serializeChatToHtml produces secure, styled standalone HTML', () => {
  const history = [
    { role: 'user' as const, content: [{ text: 'Test <script>alert(1)</script>' }] },
    { role: 'assistant' as const, content: [{ text: 'Safe & sound response' }] },
  ];
  const html = serializeChatToHtml('Test Chat', history);

  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<title>Test Chat<\/title>/);
  // Confirms HTML escaping
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Safe &amp; sound response/);
  assert.match(html, /class="chat-card user-turn"/);
  assert.match(html, /class="chat-card ai-turn"/);
});
