import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { McpToolBridge, ContextCompactor, type McpToolDefinition } from '../src/workspace/ai/mcp-tool-bridge';

describe('Universal MCP Tool Bridge & Context Compactor', () => {
  const tools: McpToolDefinition[] = [
    {
      name: 'set_timer',
      description: 'Set a countdown timer',
      parameters: { minutes: { type: 'number', required: true } }
    },
    {
      name: 'whats_playing',
      description: 'Check active music track',
      parameters: {}
    }
  ];

  it('formats tool definitions into prompt instructions', () => {
    const prompt = McpToolBridge.formatToolSystemPrompt(tools);
    assert.ok(prompt.includes('Available Tools:'));
    assert.ok(prompt.includes('set_timer'));
    assert.ok(prompt.includes('whats_playing'));
  });

  it('extracts and parses valid JSON tool call from model prose', () => {
    const modelOutput = `
I can help with that. Let me set a timer for you right away.
\`\`\`json
{
  "tool": "set_timer",
  "arguments": { "minutes": 15 }
}
\`\`\`
Hope that helps!
`;
    const call = McpToolBridge.parseToolCall(modelOutput, tools);
    assert.ok(call !== null);
    assert.equal(call?.tool, 'set_timer');
    assert.equal(call?.arguments.minutes, 15);
  });

  it('rejects unknown tool calls safely', () => {
    const raw = '```json\n{"tool": "delete_hard_drive", "arguments": {}}\n```';
    const call = McpToolBridge.parseToolCall(raw, tools);
    assert.equal(call, null);
  });

  it('compacts overlong conversation history with semantic summary', () => {
    const history = [
      { role: 'user' as const, content: 'What is local-first software and why is it important?' },
      { role: 'assistant' as const, content: 'Local-first prioritizes device storage and ownership over cloud servers.' },
      { role: 'user' as const, content: 'Explain CRDT algorithms in distributed databases.' },
      { role: 'assistant' as const, content: 'Conflict-free Replicated Data Types guarantee eventual consistency.' },
      { role: 'user' as const, content: 'Can we build an offline voice assistant?' },
      { role: 'assistant' as const, content: 'Yes, using local models like DeepSeek and Whisper.' },
      { role: 'user' as const, content: 'Now show me the latest commit.' }
    ];

    // Force compaction with tiny budget
    const compacted = ContextCompactor.compact(history, 40, 2);
    assert.ok(compacted.tokensSavedEstimate > 0);
    assert.ok(compacted.summary.includes('Prior conversation summary:'));
    assert.equal(compacted.retainedMessages[0].role, 'system');
    assert.equal(compacted.retainedMessages[compacted.retainedMessages.length - 1].content, 'Now show me the latest commit.');
  });
});
