import { defineConfig, type Plugin } from "vite";
import { existsSync, mkdirSync, readdirSync, copyFileSync, createReadStream } from "node:fs";
import { resolve, join, extname } from "node:path";

// ───────────────────────────────────────────────────────────────────────────────
// THE one and only place the shared sound folder is declared.
// The 28 WAVs live in the macOS app and are NOT duplicated in the repo; when they
// move to `shared/sounds/`, change this single line.
export const SOUNDS_DIR = resolve(__dirname, "../NotchBuddy/Resources/sounds");
/** JARVIS voice-pack MP3s live in-repo under windows/voice-pack/ (see SOURCES.txt). */
export const VOICE_PACK_DIR = resolve(__dirname, "voice-pack");
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Serves SOUNDS_DIR at /sounds/*.wav in dev, and copies it into dist/sounds on build.
 * Keeps the WAVs out of windows/ while still shipping them inside the installer.
 */
function sharedSounds(): Plugin {
  const prefix = "/sounds/";
  return {
    name: "coucou-shared-sounds",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next();
        const name = decodeURIComponent(req.url.slice(prefix.length).split("?")[0]);
        if (name.includes("/") || name.includes("\\") || extname(name) !== ".wav") return next();
        const file = join(SOUNDS_DIR, name);
        if (!existsSync(file)) return next();
        res.setHeader("Content-Type", "audio/wav");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const out = resolve(__dirname, "dist/sounds");
      if (!existsSync(SOUNDS_DIR)) {
        this.warn(`sounds not found at ${SOUNDS_DIR} — the build will ship without audio`);
        return;
      }
      mkdirSync(out, { recursive: true });
      for (const f of readdirSync(SOUNDS_DIR)) {
        if (extname(f) === ".wav") copyFileSync(join(SOUNDS_DIR, f), join(out, f));
      }
    },
  };
}

/**
 * Serves VOICE_PACK_DIR at /voice-pack/*.mp3 in dev and copies into dist/voice-pack on build.
 * Missing samples are non-fatal — JARVIS falls back to Web Speech + Web Audio chirp.
 */
function voicePack(): Plugin {
  const prefix = "/voice-pack/";
  return {
    name: "anf-voice-pack",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next();
        const name = decodeURIComponent(req.url.slice(prefix.length).split("?")[0]);
        if (name.includes("/") || name.includes("\\") || !name.toLowerCase().endsWith(".mp3")) return next();
        const file = join(VOICE_PACK_DIR, name);
        if (!existsSync(file)) return next();
        res.setHeader("Content-Type", "audio/mpeg");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const out = resolve(__dirname, "dist/voice-pack");
      if (!existsSync(VOICE_PACK_DIR)) {
        this.warn(`voice-pack not found at ${VOICE_PACK_DIR} — JARVIS ships without MP3 identity cues`);
        return;
      }
      mkdirSync(out, { recursive: true });
      let copied = 0;
      for (const f of readdirSync(VOICE_PACK_DIR)) {
        if (extname(f).toLowerCase() === ".mp3") {
          copyFileSync(join(VOICE_PACK_DIR, f), join(out, f));
          copied++;
        }
      }
      if (copied === 0) {
        this.warn(`voice-pack has no .mp3 files yet — drop samples into ${VOICE_PACK_DIR}`);
      }
    },
  };
}

export default defineConfig({
  plugins: [sharedSounds(), voicePack()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    // The Cargo workspace lives in windows/, so its target/ sits inside Vite's root.
    // Watching it crashes Vite with EBUSY on Windows while cargo holds .pdb files open.
    watch: { ignored: ["**/target/**", "**/src-tauri/**", "**/hook/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "chrome110",
    minify: "esbuild",
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        island: resolve(__dirname, "index.html"),
        settings: resolve(__dirname, "settings.html"),
        workspace: resolve(__dirname, "workspace.html"),
        companion: resolve(__dirname, "companion.html"),
      },
    },
  },
});
