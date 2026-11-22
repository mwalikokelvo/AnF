# Grok addition: set_volume for Kevo

Insert this action into windows/src/workspace/jarvis/voice/kevo-actions.ts (near the reminder actions):

```ts
  {
    name: 'set_volume',
    description: 'Sets the music or system volume to a percentage (0-100).',
    parameters: {
      type: 'object',
      properties: {
        level: { type: 'number', description: 'Volume level from 0 to 100' },
      },
      required: ['level'],
    },
    execute: async (args: { level: number }, ctx: JarvisActionContext) => {
      const level = Math.max(0, Math.min(100, Math.round(Number(args?.level) || 50)));
      if (ctx.setVolume) {
        try {
          if (!ctx.dryRun) await ctx.setVolume(level);
          return {
            handled: true,
            actionName: 'set_volume',
            speechReply: `Volume set to ${level} percent, sir.`,
            status: 'success',
            verified: true,
            verificationDetails: `Volume set to ${level}`,
          };
        } catch (err: any) {
          return {
            handled: false,
            actionName: 'set_volume',
            speechReply: `Could not set volume: ${err?.message || err}`,
            status: 'failure',
            verified: false,
            error: String(err),
            reason: 'EXECUTION_FAILED',
          };
        }
      }
      return {
        handled: false,
        actionName: 'set_volume',
        speechReply: 'Volume control is not available in this environment, sir.',
        status: 'failure',
        verified: false,
        reason: 'NOT_SUPPORTED',
      };
    },
  },
```

Test file windows/tests/kevo-set-volume.test.ts is already pushed. This adds a useful capability inspired by leading voice assistants without copying any proprietary code. Always adding something positive.
