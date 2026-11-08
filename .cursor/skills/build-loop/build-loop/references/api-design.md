# Reference: API Design Playbook

## IPC & Boundary Protocol Principles
Communication between the frontend WebView and the native desktop/mobile host follows strict, strongly-typed asynchronous message protocols.

## Tauri IPC Command Patterns (Rust ↔ TypeScript)
1. **Command Registration (`src-tauri/src/main.rs`)**:
   - Every IPC handler is declared with `#[tauri::command]` and returns `Result<T, AppError>`.
   - IPC serialization uses `serde` with camelCase JSON property mapping.
2. **TypeScript Invocation Wrapper**:
   ```typescript
   import { invoke } from '@tauri-apps/api/core';

   export async function readVaultNote(id: string): Promise<VaultNote> {
     return await invoke<VaultNote>('vault_read_note', { id });
   }
   ```
3. **Error Contract**:
   - Never throw raw strings or generic untyped errors across the IPC boundary.
   - Return structured error codes: `{ code: 'NOT_FOUND' | 'DECRYPTION_FAILED' | 'IO_ERROR', message: string }`.

## External Service Contracts
- **Streaming Audio**: Audio stream resolvers decouple search metadata from physical audio download URLs.
- **Lyrics Providers**: LRCLIB contract matches `{ title, artist, duration }` returning structured `LyricLine[]` with millisecond timestamps.
- **Local AI Endpoint**: Local model weights expose an OpenAI-compatible `/v1/chat/completions` REST interface.
