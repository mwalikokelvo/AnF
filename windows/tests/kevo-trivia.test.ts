import { describe, it, expect, vi } from 'vitest';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

describe('Kevo trivia', () => {
  it('handles trivia request by calling Open Trivia DB', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response_code: 0,
        results: [{
          category: 'Science',
          question: 'What is 2+2?',
          correct_answer: '4',
          type: 'multiple'
        }]
      })
    });
    global.fetch = mockFetch;

    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      askAI: async () => 'ai',
    });

    const result = await agent.processVoiceInput('tell me a trivia question');
    expect(result.handled).toBe(true);
    expect(result.actionName).toBe('trivia');
    expect(result.speechReply).toContain('Science');
    expect(result.speechReply).toContain('What is 2+2?');
    expect(result.speechReply).toContain('4');
  });
});
