# Reference: UI Frontend Architecture

## Frontend Stack
- **Framework**: Modern TypeScript with native DOM component patterns and lightweight reactive models.
- **Bundler & Tooling**: Vite with strict TypeScript compilation (`tsc --noEmit`).
- **Styling**: Tailwind CSS utility design tokens coupled with custom CSS custom properties for instant theme switching.
- **Editor & Authoring**: CodeMirror 6 with Markdown language extensions, syntax highlighting, and custom autocomplete.

## Component Layout Structure
```
windows/src/
├── workspace/
│   ├── music-hub.ts          # Media player, queue, lyrics display
│   ├── reader.ts             # Reading queue, typography theme renderer
│   ├── writing.ts            # Markdown editor & publishing drawer
│   ├── audio-studio.ts       # Canvas waveform, recording transport
│   ├── vault-panel.ts        # Note navigation & search
│   ├── zim-reader.ts         # Kiwix ZIM archive document viewer
│   ├── addons.ts             # Orion store manager & sandbox container
│   ├── tts-service.ts        # Voice synthesis disk cache & engine
│   └── offline-sync.ts       # Global connectivity & mutation state
```

## Performance & Rendering Rules
- Waveforms and audio meters must render via `requestAnimationFrame` on `<canvas>` elements to avoid DOM thrashing.
- Long reading lists and search results must use DOM virtualization to maintain consistent 60fps scrolling performance.
