/**
 * Universal MCP Tool Bridge & Rolling Context Compactor for AnF & ThingsBook
 * 
 * Standardizes Model Context Protocol (MCP) tool-calling across local
 * models that lack native function-calling, and provides rolling semantic
 * context compaction for infinite conversations without context exhaustion.
 * Inspired by Twigpine/openclaude + paperclipai/paperclip.
 */

export interface McpToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, McpToolParameter>;
}

export interface McpToolCall {
  tool: string;
  arguments: Record<string, any>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompactedContext {
  summary: string;
  retainedMessages: ChatMessage[];
  tokensSavedEstimate: number;
}

export const McpToolBridge = {
  /**
   * Format available MCP tools into a strict prompt instruction for any local LLM.
   */
  formatToolSystemPrompt(tools: McpToolDefinition[]): string {
    let prompt = 'You have access to the following local tools. When needed, respond ONLY with a JSON code block in this format:\n';
    prompt += '```json\n{\n  "tool": "tool_name",\n  "arguments": { ... }\n}\n```\n\n';
    prompt += 'Available Tools:\n';
    for (const t of tools) {
      prompt += `- **${t.name}**: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters)}\n`;
    }
    return prompt;
  },

  /**
   * Parse tool call JSON from raw model text output, validating tool name and arguments.
   */
  parseToolCall(modelOutput: string, availableTools: McpToolDefinition[]): McpToolCall | null {
    if (!modelOutput || typeof modelOutput !== 'string') return null;

    // Search for fenced json or raw json object
    const match = modelOutput.match(/```(?:json)?\s*(\{[\s\S]+?\})\s*```/) || modelOutput.match(/(\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*\})/);
    if (!match) return null;

    try {
      const parsed = JSON.parse(match[1]);
      if (typeof parsed?.tool !== 'string') return null;

      const toolDef = availableTools.find(t => t.name === parsed.tool);
      if (!toolDef) return null;

      const args = typeof parsed.arguments === 'object' && parsed.arguments !== null ? parsed.arguments : {};
      return { tool: parsed.tool, arguments: args };
    } catch {
      return null;
    }
  }
};

export const ContextCompactor = {
  /**
   * Estimate token count from character length (~4 chars per token).
   */
  estimateTokens(text: string): number {
    return Math.ceil((text || '').length / 4);
  },

  /**
   * Compact conversation history if token estimate exceeds budget.
   */
  compact(
    messages: ChatMessage[],
    maxTokensBudget = 2000,
    keepRecentCount = 4
  ): CompactedContext {
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    const estimatedTokens = Math.ceil(totalChars / 4);

    if (estimatedTokens <= maxTokensBudget || messages.length <= keepRecentCount) {
      return {
        summary: '',
        retainedMessages: [...messages],
        tokensSavedEstimate: 0,
      };
    }

    const cutIdx = Math.max(0, messages.length - keepRecentCount);
    const olderMessages = messages.slice(0, cutIdx);
    const retainedMessages = messages.slice(cutIdx);

    // Build dense structural summary of older turns
    const topics: string[] = [];
    for (const m of olderMessages) {
      if (m.role === 'user') {
        const snippet = m.content.slice(0, 60).replace(/\n/g, ' ');
        topics.push(`User asked: "${snippet}"`);
      }
    }

    const summary = `Prior conversation summary: User explored topics: [${topics.slice(-5).join('; ')}].`;
    const olderChars = olderMessages.reduce((sum, m) => sum + m.content.length, 0);
    const tokensSavedEstimate = Math.max(0, Math.ceil(olderChars / 4) - Math.ceil(summary.length / 4));

    return {
      summary,
      retainedMessages: [
        { role: 'system', content: summary },
        ...retainedMessages,
      ],
      tokensSavedEstimate,
    };
  }
};
