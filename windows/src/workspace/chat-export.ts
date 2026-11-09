/**
 * Chat conversation export engine for AnF Local AI Workspace.
 * Serializes conversation turns, active source citations, and metadata
 * into standard Obsidian-compatible Markdown and standalone self-styled HTML.
 */

export interface ChatExportTurn {
  role: 'user' | 'assistant';
  content: { text: string }[];
}

export interface ChatExportSource {
  name: string;
  text?: string;
}

export function serializeChatToMarkdown(
  title: string,
  history: ChatExportTurn[],
  sources: ChatExportSource[] = []
): string {
  const lines: string[] = [
    `# ${title}`,
    `*Exported from AnF Local AI Workspace on ${new Date().toLocaleDateString()}*\n`,
  ];

  if (sources.length > 0) {
    lines.push('## Active Sources');
    for (const s of sources) {
      lines.push(`- **${s.name}**`);
    }
    lines.push('');
  }

  lines.push('## Conversation\n');
  for (const turn of history) {
    const roleName = turn.role === 'user' ? '👤 **User**' : '🤖 **AnF Local AI**';
    const text = turn.content.map((c) => c.text).join('\n\n');
    lines.push(`### ${roleName}\n\n${text}\n`);
  }

  return lines.join('\n');
}

export function serializeChatToHtml(
  title: string,
  history: ChatExportTurn[],
  sources: ChatExportSource[] = []
): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const turnsHtml = history
    .map((turn) => {
      const isUser = turn.role === 'user';
      const roleBadge = isUser ? 'User' : 'AnF Local AI';
      const roleClass = isUser ? 'user-turn' : 'ai-turn';
      const text = turn.content
        .map((c) => `<p>${escape(c.text).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`)
        .join('');
      return `<div class="chat-card ${roleClass}"><div class="chat-role">${roleBadge}</div><div class="chat-body">${text}</div></div>`;
    })
    .join('\n');

  const sourcesHtml = sources.length
    ? `<div class="sources-box"><h3>Active Sources</h3><ul>${sources
        .map((s) => `<li>${escape(s.name)}</li>`)
        .join('')}</ul></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
body { font-family: system-ui, -apple-system, sans-serif; background: #121718; color: #edf4ef; max-width: 760px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
h1 { color: #79e4b4; margin-bottom: 4px; }
.meta { color: #8fa0a3; font-size: 13px; margin-bottom: 24px; }
.sources-box { background: #1a2224; border: 1px solid #2d3b3c; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; font-size: 13px; }
.sources-box h3 { margin: 0 0 8px 0; font-size: 14px; color: #79e4b4; }
.sources-box ul { margin: 0; padding-left: 20px; }
.chat-card { border-radius: 12px; padding: 14px 18px; margin-bottom: 16px; }
.user-turn { background: #1a2528; border: 1px solid #283e39; }
.ai-turn { background: #162022; border: 1px solid #223233; border-left: 3px solid #79e4b4; }
.chat-role { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; color: #79e4b4; margin-bottom: 8px; }
.user-turn .chat-role { color: #8fa0a3; }
p { margin: 8px 0; }
</style>
</head>
<body>
<h1>${escape(title)}</h1>
<p class="meta">Exported from AnF Local AI Workspace</p>
${sourcesHtml}
${turnsHtml}
</body>
</html>`;
}
