// Claude Code Security Review-grade Agent Tool Guard & Output Sanitizer.
// Enforces path boundaries, command execution blacklists, and context leakage sanitization.

import { redactSecrets } from './secret-scanner.js';

function normalizePath(p: string): string {
  const normalized = p.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const resolvedParts: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (resolvedParts.length > 0) resolvedParts.pop();
    } else {
      resolvedParts.push(part);
    }
  }
  const prefix = normalized.startsWith('/') ? '/' : '';
  return (prefix + resolvedParts.join('/')).toLowerCase();
}

export interface ToolGuardOptions {
  allowedWorkspaceRoots: string[];
  blockedCommandPatterns?: RegExp[];
  maxOutputChars?: number;
}

export interface ToolValidationResult {
  allowed: boolean;
  sanitizedArgs?: Record<string, any>;
  violation?: string;
}

const DEFAULT_BLOCKED_COMMANDS: RegExp[] = [
  /\brm\s+-[rf]{1,2}\s+[\/\\]/i,
  /\bdel\s+\/[fq]\s+[a-z]:\\/i,
  /\bformat\s+[a-z]:/i,
  /\bcurl\b[^\n|]*\|\s*(?:ba|z|c)?sh\b/i,
  /\bwget\b[^\n|]*\|\s*(?:ba|z|c)?sh\b/i,
  /\bpowershell\b[^\n]*-(?:enc|encodedcommand)\b/i,
  /\bchmod\s+777\s+[\/\\]/i,
];

export class AgentToolGuard {
  private allowedRoots: string[];
  private blockedCommands: RegExp[];
  private maxOutputChars: number;

  constructor(options: ToolGuardOptions) {
    this.allowedRoots = (options.allowedWorkspaceRoots || []).map(r => normalizePath(r));
    this.blockedCommands = options.blockedCommandPatterns || DEFAULT_BLOCKED_COMMANDS;
    this.maxOutputChars = options.maxOutputChars || 64000;
  }

  /**
   * Validates whether a file path argument stays strictly inside the designated workspace.
   */
  public isPathWithinWorkspace(targetPath: string): boolean {
    if (!targetPath) return false;
    try {
      const resolved = normalizePath(targetPath);
      return this.allowedRoots.some(root => resolved === root || resolved.startsWith(root + '/'));
    } catch {
      return false;
    }
  }

  /**
   * Validates tool invocation arguments before dispatching to execution.
   */
  public validateInvocation(toolName: string, args: Record<string, any>): ToolValidationResult {
    // 1. Filesystem tool path validation
    if (toolName === 'read_file' || toolName === 'write_file' || toolName === 'edit_file' || toolName === 'delete_file') {
      const filePath = args.Path || args.path || args.filePath || args.targetPath;
      if (typeof filePath === 'string') {
        if (!this.isPathWithinWorkspace(filePath)) {
          return {
            allowed: false,
            violation: `Path "${filePath}" escapes authorized workspace root boundaries.`,
          };
        }
      }
    }

    // 2. Shell execution command validation
    if (toolName === 'run_command' || toolName === 'exec' || toolName === 'terminal_execute') {
      const cmd = String(args.CommandLine || args.command || args.cmd || '');
      for (const pattern of this.blockedCommands) {
        if (pattern.test(cmd)) {
          return {
            allowed: false,
            violation: `Command "${cmd}" matches dangerous destructive execution pattern (${pattern}).`,
          };
        }
      }
    }

    return { allowed: true, sanitizedArgs: args };
  }

  /**
   * Sanitizes tool execution outputs before appending to LLM memory.
   * Redacts leaked secrets and truncates excessive payloads.
   */
  public sanitizeOutput(rawOutput: string): string {
    if (!rawOutput) return '';
    let result = rawOutput;

    // Truncate if over length budget
    if (result.length > this.maxOutputChars) {
      result = result.slice(0, this.maxOutputChars) + `\n... [Output truncated at ${this.maxOutputChars} characters]`;
    }

    // Redact secret credentials
    result = redactSecrets(result);

    return result;
  }
}
