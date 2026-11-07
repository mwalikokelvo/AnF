// Local Subsonic UI check: stubs the Tauri IPC, seeds a server in localStorage,
// searches, and plays a synthetic WAV. No network and no Rust process needed.
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {go} from './fixture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const base = path.resolve(process.env.DIST_DIR || path.join(root, 'windows/dist'));
const output = path.join(root, 'releases/music-hub-previews');
await mkdir(output, { recursive: true });

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(base, decodeURIComponent(url.pathname.slice(1)));
    if (!file.startsWith(base + path.sep)) throw Error('Path');
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm'})[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});
await new Promise(resolve => server.listen(4183, '127.0.0.1', resolve));

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : { channel: 'msedge' }),
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  await context.addInitScript(() => {
    localStorage.setItem('anf-subsonic-server', 'http://127.0.0.1:4533');
    localStorage.setItem('anf-subsonic-user', 'ada');
    window.__playedSrc = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      try { window.__playedSrc.push(this.currentSrc || this.src || ''); } catch { /* ignore */ }
      return play.apply(this, arguments);
    };
    const wav = (() => {
      const bytes = new ArrayBuffer(44 + 8000 * 4);
      const view = new DataView(bytes);
      const text = (at, value) => Array.from(value).forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
      text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true);
      view.setUint16(34, 8, true); text(36, 'data'); view.setUint32(40, bytes.byteLength - 44, true);
      for (let i = 44; i < bytes.byteLength; i++) view.setUint8(i, 128 + Math.round(20 * Math.sin(i * 0.1)));
      return bytes;
    })();
    let current = { id: 'fixture', name: 'Subsonic QA', title: 'Saved work', draft: '', question: '', history: [], sources: [], memory: '', model: 'fast' };
    window.__TAURI_INTERNALS__ = { invoke: async (command) => {
      switch (command) {
        case 'workspace_list_projects': return [{ id: 'fixture', name: 'Subsonic QA', updated: Date.now() }];
        case 'workspace_load_project': return current;
        case 'workspace_save_project': return current;
        case 'workspace_diagnostics': return { runtime: true, fast: true, balanced: true, ocr: true, documents: 'Local', log: 'Fixture', version: '0.1.48' };
        case 'link_address': return '';
        case 'link_status': return false;
        case 'music_available': return false;
        case 'music_pause': return;
        case 'music_hide': return;
        case 'log_line': return;
        case 'secret_present': return true;
        case 'subsonic_search': return [
          { id: 's1', title: 'Morning Light', artist: 'Elise Monroe', album: 'QA', duration: 4, suffix: 'wav' },
          { id: 's2', title: 'City Signals', artist: 'Theo Marks', album: 'QA', duration: 4, suffix: 'wav' },
        ];
        case 'subsonic_stream': return wav;
        default: throw Error('Unexpected IPC ' + command);
      }
    } };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4183/workspace.html');
  await page.locator('[data-view="music"]').waitFor({ state: 'attached' });
  await go(page, 'music');
  await page.getByRole('tab', { name: 'Subsonic', exact: true }).click();
  await page.getByLabel('Search your Subsonic server', { exact: true }).fill('morning');
  await page.getByRole('button', { name: 'Search server', exact: true }).click();
  await page.locator('.music-archive-row').first().waitFor({ timeout: 10000 });
  assert.equal(await page.locator('.music-archive-row').count(), 2, 'both stub tracks are listed');
  await page.locator('.music-archive-row .music-archive-play').first().click();
  await page.locator('.music-player button[aria-label="Pause"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  assert.equal((await page.locator('.music-player strong').first().textContent())?.trim(), 'Morning Light');
  const played = await page.evaluate(() => window.__playedSrc || []);
  assert.ok(played.some(src => src.startsWith('blob:')), 'the Subsonic bytes are played as a local blob');
  await page.screenshot({ path: path.join(output, 'subsonic-tab.png') });
  assert.deepEqual(errors, []);
  console.log('PASS Subsonic tab: search listed 2 tracks, Play streamed the stubbed bytes and the player shows Morning Light.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
