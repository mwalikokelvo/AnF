# Vendor Integration: Fish Audio SDK & TTS Client

## Package Details
- **Package**: `@fishaudio/agent-client`
- **Installation**: Installed in `windows/package.json` dependencies.
- **Repository / Documentation**: https://www.npmjs.com/package/@fishaudio/agent-client

## Architecture & Integration with AnF
Fish Audio provides high-fidelity neural speech synthesis that plugs into AnF's `TtsProvider` interface defined in `windows/src/workspace/tts-service.ts`.

### Implementing the `TtsProvider` Adapter
```typescript
import { FishAudioClient } from '@fishaudio/agent-client';
import type { TtsProvider, TtsSynthesisRequest } from './tts-service';

export class FishAudioTtsProvider implements TtsProvider {
  private client: FishAudioClient;

  constructor(apiKey: string) {
    this.client = new FishAudioClient({ apiKey });
  }

  async synthesize(request: TtsSynthesisRequest): Promise<Uint8Array> {
    // Request synthesis from Fish Audio API
    const response = await this.client.tts.synthesize({
      text: request.text,
      referenceId: request.voiceId,
      format: request.format === 'wav' ? 'wav' : 'mp3',
    });

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }
}
```

### Integration Guidelines
1. **Tier 3 Disk Caching Prerequisite**:
   - Never call Fish Audio directly from UI components. Always route requests through `synthesizeChunk()` in `tts-service.ts`.
   - Repeated sentences or paragraphs are served instantly from the local `.chunk` disk cache, conserving network bandwidth and API credits.
2. **Offline Fallback**:
   - If the device is offline or the Fish Audio API request fails, gracefully fallback to local speech synthesis (or cached chunks) without crashing the application.
3. **API Key Security**:
   - Store Fish Audio API keys in SQLCipher Tier 1 encrypted vault storage; never hardcode or commit keys to git.
