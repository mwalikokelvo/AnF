import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  probeOllama,
  detectBackends,
  callOllama,
  callOpenAiCompatible,
  routeChatCompletion
} from '../src/workspace/ai/openclaude-router';

describe('OpenClaude Decoupled Provider Router', () => {
  it('probes Ollama status and parses models list', async () => {
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        models: [{ name: 'llama3:8b' }, { name: 'qwen2.5:7b' }]
      })
    } as unknown as Response);

    const res = await probeOllama('http://127.0.0.1:11434', mockFetch as typeof fetch);
    assert.equal(res.active, true);
    assert.deepEqual(res.models, ['llama3:8b', 'qwen2.5:7b']);
  });

  it('detects available backends including local offline by default', async () => {
    const backends = await detectBackends({
      openai: { provider: 'openai', apiKey: 'sk-test' }
    });
    const local = backends.find(b => b.provider === 'local');
    const openai = backends.find(b => b.provider === 'openai');
    const claude = backends.find(b => b.provider === 'claude');

    assert.equal(local?.available, true);
    assert.equal(openai?.available, true);
    assert.equal(claude?.available, false);
  });

  it('calls Ollama chat API correctly', async () => {
    let capturedBody = '';
    const mockFetch = async (_url: unknown, opts: any) => {
      capturedBody = opts.body;
      return {
        ok: true,
        json: async () => ({ message: { content: 'Ollama response here' } })
      } as unknown as Response;
    };

    const reply = await callOllama(
      { messages: [{ role: 'user', content: 'Hello' }], system: 'You are helpful' },
      { provider: 'ollama', model: 'mistral' },
      mockFetch as typeof fetch
    );

    assert.equal(reply, 'Ollama response here');
    assert.ok(capturedBody.includes('mistral'));
    assert.ok(capturedBody.includes('You are helpful'));
  });

  it('gracefully falls back to local when preferred remote backend fails', async () => {
    const failingFetch = async () => ({
      ok: false,
      status: 500
    } as unknown as Response);

    const fallbackMock = async () => 'Local offline answer';

    const res = await routeChatCompletion(
      { messages: [{ role: 'user', content: 'Test' }], preferredProvider: 'ollama' },
      { ollama: { provider: 'ollama' } },
      fallbackMock,
      failingFetch as typeof fetch
    );

    assert.equal(res.content, 'Local offline answer');
    assert.equal(res.provider, 'local');
  });
});
